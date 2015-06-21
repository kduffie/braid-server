function resolveFederationUrl(domain) {
	// This is a temporary hack to allow for testing. The suffix of the domain
	// name is used as the port number to connect to on localhost
	var parts = domain.split(".");
	var port = parts[parts.length - 1];
	return "ws://localhost:" + port + "/braid-domain";
}

module.exports = {
	resolveFederationUrl : resolveFederationUrl
};