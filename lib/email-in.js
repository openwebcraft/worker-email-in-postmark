/*
TODO:
 - code formatting
  - make doc hoodie-capable
 - print useful output when run from the commandline
 - add user-email-hashing config
 - more docs
 - add debug mode
*/

console.log('here I am!')

var http = require("http");
var url = require("url");
var request = require("request");
var uuid = require("node-uuid");

module.exports = WorkerEmailInPostmark;

function WorkerEmailInPostmark(config, cb) {
    this._config = config;

    // Variable to hold chunked data from Postmark.
    var mailRaw = "";
    var me = this;

    this._server = http.createServer(function (req, res) {

        req.on("data", function(chunk) {
            mailRaw += chunk;
        });

        req.on("end", function() {

            // Get the JSON payload from Postmark.
            if(!mailRaw) { 
                console.log("no mailRaw, skip");
                res.end();
                return;
            }

            var mailJSON = me._postMarkToHoodie(mailRaw);

            // hoodie+hash@inbound.postmarkapp.com
            var db = me._parseDbName(mailJSON);

            me._doSaveDoc(db, mailJSON);

            // Reset our holder variable.
            mailRaw = "";

            // Send an empty response.
            res.end();
            // console.log("req-done yay");
        });

    }).listen(config.port, "0.0.0.0", null, cb);
    console.log('Server running at http://0.0.0.0:' + config.port);

}

WorkerEmailInPostmark.prototype.stop = function(cb)
{
    this._server.close(cb);
}

WorkerEmailInPostmark.prototype._parseDbName = function(doc)
{
    // if "mail+hash@..."
    //   db = hash
    if(doc.MailboxHash) {
        return doc.MailboxHash;
    }

    // if From == known user
    //   db = user db
    if(doc.From) {
        // mangle via config wubble
        return doc.From;
    }

    // else
    //   db = catchall db for losers
    return this._config.default_db;
}

WorkerEmailInPostmark.prototype._doSaveDoc = function(db, doc)
{
    // Insert new document.
    var uri = url.parse(this._config.server);
    uri.path = "/" + encodeURIComponent(db) + "/";
    if(this._config.admin) {
        uri.auth = this._config.admin.user + ":" + this._config.admin.pass;
    }
    request({
        uri: uri,
        method: "POST",
        json: doc
    }, function(error, response) {
        if(error) {
            console.log("Set Doc status fail: " + error);
        }
        //  console.log("Save doc response: %j", response);
    });

}

WorkerEmailInPostmark.prototype._postMarkToHoodie = function(mailRaw)
{
    var mailJSON = JSON.parse(mailRaw);

    mailJSON._id = "image/" + uuid.v4().replace(/-/g, "");
    mailJSON.name = mailJSON.Subject;
    mailJSON.description = mailJSON.TextBody;
    mailJSON.type = "image";
    mailJSON.created_at = mailJSON.updated_at = new Date

    if(mailJSON.Attachments && mailJSON.Attachments.length) {
        mailJSON._attachments = {};
        mailJSON.Attachments.forEach(function(attachment) {
            mailJSON.filename = attachment.Name;
            mailJSON._attachments[attachment.Name] = {
                content_type: attachment.ContentType,
                data: attachment.Content
            };
        });
        delete mailJSON.Attachments;
    }
    return mailJSON;
}
