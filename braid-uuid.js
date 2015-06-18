var uuid = require('node-uuid');

function newUuid() {
	return uuid.v1();
}

module.exports = newUuid;