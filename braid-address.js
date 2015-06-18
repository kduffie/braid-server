/*jshint eqeqeq: false*/

/**
 * Braid address
 */

function BraidAddress(userId, domain, resource) {
	this.userId = userId;
	this.domain = domain;
	this.resource = resource;
}

BraidAddress.prototype.asString = function(omitResource) {
	var result = this.domain;
	if (this.userId) {
		if (this.domain) {
			result = result + "/" + this.userId;
		} else {
			result = this.userId;
		}
	}
	if (this.resource && !omitResource) {
		result = result + ":" + this.resource;
	}
	return result;
};

BraidAddress.prototype.equals = function(address, ignoreResource) {
	return this.userId == address.userId && this.domain == address.domain && (!ignoreResource || this.resource == address.resource);
};

function newAddress(address, omitResource) {
	return new BraidAddress(address.userId, address.domain, omitResource ? null : address.resource);
}

if (typeof module !== 'undefined') {
	module.exports = {
		BraidAddress : BraidAddress,
		newAddress : newAddress
	};
}
