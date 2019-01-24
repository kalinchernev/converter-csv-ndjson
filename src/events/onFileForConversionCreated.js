const AWS = require("aws-sdk");
const parse = require("csv-parse");
const stream = require("stream");
const transform = require("stream-transform");

exports.handler = (event, context, callback) => {
  // Extract useful information from AWS Lambda's event.
  const message = JSON.parse(event.Records[0].Sns.Message);
  const { s3 } = message.Records[0];
  const { name: bucket } = s3.bucket;
  const { key: file } = s3.object;

  const s3client = new AWS.S3();

  const parser = parse({ columns: true, delimiter: ";" });

  const formatter = record => {
    const {
      Name: beer,
      id,
      Description: description,
      Style: style,
      Category: category
    } = record;
    return { id, beer, description, style, category };
  };

  const transformer = transform(
    (record, callback) => {
      try {
        const row = formatter(record);
        return callback(null, `${JSON.stringify(row)}\n`);
      } catch (e) {
        return callback(e);
      }
    },
    {
      parallel: 5
    }
  );

  const read = s3client
    .getObject({ Bucket: bucket, Key: file })
    .createReadStream();

  const write = () => {
    const pass = new stream.PassThrough();

    const params = {
      Bucket: bucket,
      Key: `${file}.ndjson`,
      Body: pass,
      ContentType: "application/x-ndjson"
    };

    s3client.upload(params, err => {
      if (err) callback(err);
    });

    return pass;
  };

  read
    .on("error", error => {
      callback(`Read error for ${file}: ${error.message}`);
    })
    .pipe(parser)
    .on("error", error => {
      callback(`Parsing error: ${error.message}`);
    })
    .pipe(transformer)
    .on("error", error => {
      callback(`Transform error: ${error.message}`);
    })
    .pipe(write())
    .on("error", error => {
      callback(`Write error: ${error.message}`);
    })
    .on("end", () => {
      callback(null, "File has been converted successfully.");
    });
};
