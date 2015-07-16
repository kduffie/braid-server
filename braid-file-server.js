var http = require('http');
var https = require('https');
var url = require('url');
var mongodb = require('mongodb');
var Grid = require('gridfs-stream');
var newUuid = require('./braid-uuid');
var fs = require('fs');
var path = require('path');
var request = require('request');
var crypto = require('crypto');
var nameService = require('./braid-name-service');
var algorithm = 'aes-256-ctr';
var stream = require('stream');
var streamifier = require('streamifier');

function FileServer() {

}

FileServer.prototype.getCertificateAuthority = function() {
	if (this.config.ssl && this.config.ssl.ca) {
		var ca = [];
		var chain = fs.readFileSync(this.config.ssl.ca, 'utf8');
		chain = chain.split("\n");
		var cert = [];
		for (var i = 0; i < chain.length; i++) {
			var line = chain[i];
			if (line.length > 0) {
				cert.push(line);
				if (line.match(/-END CERTIFICATE-/)) {
					ca.push(cert.join('\n'));
					cert = [];
				}
			}
		}
		return ca;
	}
};

FileServer.prototype.initialize = function(config, services) {
	if (config.fileServer && !config.fileServer.enabled) {
		console.log("file-server: not installed based on configuration");
		return;
	}
	this.config = config;
	this.factory = services.factory;
	this.gfs = Grid(services.braidDb.db, mongodb);
	if (this.config.fileServer && !this.config.fileServer.ssl) {
		console.log("file-server: starting unencrypted server");
		this.server = http.createServer(this.requestHandler.bind(this));
	} else {
		console.log("file-server: starting encrypted server");
		var privateKey = fs.readFileSync(this.config.ssl.key, 'utf8');
		var certificate = fs.readFileSync(this.config.ssl.cert, 'utf8');
		var credentials = {
			key : privateKey,
			cert : certificate
		};
		var ca = this.getCertificateAuthority();
		if (ca) {
			credentials.ca = ca;
		}
		this.server = https.createServer(credentials, this.requestHandler.bind(this));
	}
	var port = 25565;
	if (this.config.fileServer && this.config.fileServer.port) {
		port = this.config.fileServer.port;
	}
	console.log("file-server: listening on port " + port);
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

FileServer.prototype.handleGet = function(getRequest, response) {
	console.log("file-server " + this.config.domain + ": GET " + getRequest.url);
	var parsedUrl = url.parse(getRequest.url, true);
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
	var filePath = domain + "/" + fileId;
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
		} else if (domain === this.config.domain) {
			// It originated in this domain, and I don't have it
			this.sendResponse(response, 404, "Not found");
		} else {
			// It originated in a different domain, so I'll ask that domain
			// for it
			nameService.resolveFileServer(this.config, domain, function(err, fileServerUrl) {
				if (err) {
					console.error("name server failure", err);
					this.sendResponse(response, 500, err);
				} else {
					request.get({
						uri : fileServerUrl + "/" + domain + "/" + fileId,
						encoding : null
					}, function(err, remoteResponse, body) {
						if (err) {
							this.sendResponse(response, 503, err);
						} else if (remoteResponse.statusCode !== 200) {
							this.sendResponse(response, 503, "Remote domain error " + response.statusCode);
						} else {
							contentType = remoteResponse.headers['content-type'];
							var contentLength = body.length;
							var metadata = {
								domain : domain,
								fileId : fileId,
								contentType : contentType
							};
							var options = {
								filename : filePath,
								'content-type' : contentType,
								metadata : metadata
							};
							var writestream = this.gfs.createWriteStream(options);
							writestream.on('error', function(err) {
								this.sendResponse(response, 500, err);
							}.bind(this));
							streamifier.createReadStream(body).pipe(writestream);

							response.writeHead(200, {
								'content-type' : contentType,
								'content-length' : body.length
							});
							var s = streamifier.createReadStream(body);
							if (decrypt) {
								decryptStream = crypto.createDecipher(algorithm, encryptionKey);
								s.pipe(decryptStream).pipe(response);
							} else {
								s.pipe(response);
							}
						}
					}.bind(this));
				}
			}.bind(this));
		}
	}.bind(this));
};

FileServer.prototype.handlePut = function(request, response) {
	console.log("file-server " + this.config.domain + ": PUT " + request.url);
	this.authenticateRequest(request, response, function(identity) {
		var parsedUrl = url.parse(request.url, true);
		var pathParts = parsedUrl.pathname.split('/');
		if (pathParts < 3) {
			this.sendResponse(response, 400, "Invalid URL:  must include domain and fileId path components");
			return;
		}
		var domain = pathParts[1];
		if (domain !== this.config.domain) {
			this.sendResponse(response, 400, "Invalid URL:  this domain is not supported by this server");
			return;
		}
		var fileId = pathParts[2];
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
	console.log("file-server " + this.config.domain + ": responding " + code + " " + message);
	response.writeHead(code, {
		'Content-Type' : 'text/plain'
	});
	if (typeof message === 'string') {
		response.end(message);
	} else {
		response.end(JSON.stringify(message));
	}
};

FileServer.prototype.sendSuccess = function(response, details) {
	console.log("file-server " + this.config.domain + ": responding 200", details);
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