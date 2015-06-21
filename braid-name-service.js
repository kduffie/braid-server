var dns = require('dns');

function resolveServer(domain, callback) {
	// To handle development scenarios, we'll handle a special case where domain name ends in a port number, which would not
	// be a legal domain name. So we can safely handle this one as special.

	if (domain.match(/.*\.\d+/)) {
		var index = domain.lastIndexOf('.');
		var port = domain.substring(index + 1);
		console.log("Resolving domain server based on development mode domain: " + domain);
		callback(null, "ws://localhost:" + port + "/braid-federation");
	}

	dns.resolveSrv('_braid-server._tcp.' + domain, function onLookup(err, addresses) {
		if (err) {
			callback(err);
		} else {
			console.log('SRV addresses for ' + domain, addresses);
			if (addresses && addresses.length > 0) {
				// TODO: should try multiple targets in priority order, if available
				callback(null, "ws://" + addresses[0].name + ":" + addresses[0].port + "/braid-federation");
			} else {
				// Otherwise, we assume a "standard" port number for braid federation
				callback(null, "ws://" + domain + ":25557/braid-federation");
			}
		}
		// TODO: This should be wss rather than ws once we go secure
	});

}

module.exports = {
	resolveServer : resolveServer
};