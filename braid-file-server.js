var http = require('http');
var url = require('url');
var mongodb = require('mongodb');
var Grid = require('gridfs-stream');
var newUuid = require('./braid-uuid');
var fs = require('fs');
var path = require('path');
var crypto = require('crypto');
var algorithm = 'aes-256-ctr';

function FileServer() {

}

FileServer.prototype.initialize = function(config, services) {
	this.config = config;
	this.factory = services.factory;
	this.gfs = Grid(services.braidDb.db, mongodb);
	this.server = http.createServer(this.requestHandler.bind(this));
	var port = 25565;
	if (this.config.fileServer && this.config.fileServer.port) {
		port = this.config.fileServer.port;
	}
	this.server.listen(port);
};

FileServer.prototype.requestHandler = function(request, response) {
	switch (request.method) {
	case 'GET':
		this.handleGet(request, response);
		break;
	case 'PUT':
		this.handlePut(request, response);
		break;
	default:
		this.handleUnsupportedRequest(request, response);
		break;
	}
};

FileServer.prototype.authenticateRequest = function(request, response, callback) {
	// TODO
	callback();
};

FileServer.prototype.handleGet = function(request, response) {
	var parsedUrl = url.parse(request.url, true);
	var decrypt = false;
	var encryptionKey;
	if (parsedUrl.query['decrypt']) {
		encryptionKey = parsedUrl.query['key'];
		if (!encryptionKey) {
			this.sendResponse(400, "Encryption key missing");
			return;
		}
		decrypt = true;
	}
	var pathParts = parsedUrl.pathname.split('/');
	if (pathParts < 3) {
		this.sendResponse(response, 404, "Not found");
		return;
	}
	var domain = pathParts[1];
	var fileId = pathParts[2];
	// TODO: if foreign domain, special handling
	var filePath = this.config.domain + "/" + fileId;
	var options = {
		filename : filePath
	};
	this.gfs.findOne(options, function(err, file) {
		if (err) {
			this.sendResponse(response, 500, err);
		} else if (file) {
			response.writeHead(200, {
				'content-type' : file.metadata.contentType,
				'content-length' : file.length
			});
			var readstream = this.gfs.createReadStream(options);
			readstream.on('error', function(err) {
				this.sendResponse(response, 500, err);
			});
			readstream.on('finish', function() {

			}.bind(this));
			if (decrypt) {
				var decrypter = crypto.createDecipher(algorithm, encryptionKey);
				readstream.pipe(decrypter).pipe(response);
			} else {
				readstream.pipe(response);
			}
		} else {
			this.sendResponse(response, 404, "Not found");
		}
	}.bind(this));
};

FileServer.prototype.handlePut = function(request, response) {
	this.authenticateRequest(request, response, function(identity) {
		var parsedUrl = url.parse(request.url, true);
		var fileId = newUuid();
		var filePath = this.config.domain + "/" + fileId;
		var encrypt = false;
		var encryptionKey;
		if (parsedUrl.query['encrypt']) {
			encryptionKey = newUuid();
			if (!encryptionKey) {
				this.sendResponse(400, "Decryption key missing");
				return;
			}
			encrypt = true;
		}
		var contentType = request.headers['content-type'];
		this.isFileExists(filePath, function(err, exists) {
			if (err) {
				this.sendResponse(response, 500, err);
			} else if (exists) {
				this.sendResponse(response, 409, "File with this UUID already exists");
			} else {
				this.storeFile(request, identity, filePath, fileId, contentType, encrypt, encryptionKey, function(err, details) {
					if (err) {
						this.sendResponse(response, 500, err);
					} else {
						this.sendSuccess(response, details);
					}
				}.bind(this));
			}
		}.bind(this));
	}.bind(this));
};

FileServer.prototype.isFileExists = function(filePath, callback) {
	this.gfs.exist({
		filename : filePath
	}, callback);
};

FileServer.prototype.storeFile = function(request, identity, filePath, fileId, contentType, encrypt, encryptionKey, callback) {
	var metadata = {
		domain : this.config.domain,
		fileId : fileId,
		contentType : contentType,
		encrypted : encrypt
	};
	var options = {
		filename : filePath,
		'content-type' : contentType,
		metadata : metadata
	};
	var writestream = this.gfs.createWriteStream(options);
	writestream.on('error', callback);
	writestream.on('close', function(file) {
		if (encrypt) {
			metadata.encryptionKey = encryptionKey;
		}
		console.log("storeFile", metadata);
		callback(null, metadata);
	}.bind(this));
	if (encrypt) {
		var encrypter = crypto.createCipher(algorithm, encryptionKey);
		request.pipe(encrypter).pipe(writestream);
	} else {
		request.pipe(writestream);
	}
};

FileServer.prototype.handleUnsupportedRequest = function(request, response) {
	this.sendResponse(response, 405, "Method not allowed");
};

FileServer.prototype.sendResponse = function(response, code, message) {
	response.writeHead(code, {
		'Content-Type' : 'text/plain'
	});
	response.end(message);
};

FileServer.prototype.sendSuccess = function(response, details) {
	response.writeHead(200, {
		'Content-Type' : 'application/json'
	});
	response.end(JSON.stringify(details));
};

FileServer.prototype.close = function() {
	if (this.server) {
		this.server.close();
		delete this.server;
	}
};

module.exports = {
	FileServer : FileServer
};