/*jshint eqeqeq: false*/

/**
 * Braid address
 */

function BraidAddress(userid, domain, resource) {
	if (userid) {
		this.userid = userid;
	}
	this.domain = domain;
	if (resource) {
		this.resource = resource;
	}
}

BraidAddress.prototype.asString = function(omitResource) {
	var result = this.domain;
	if (this.userid) {
		if (this.domain) {
			result = result + "/" + this.userid;
		} else {
			result = this.userid;
		}
	}
	if (this.resource && !omitResource) {
		result = result + ":" + this.resource;
	}
	return result;
};

BraidAddress.prototype.equals = function(address, ignoreResource) {
	return this.userid == address.userid && this.domain == address.domain && (!ignoreResource || this.resource == address.resource);
};

function newAddress(address, omitResource) {
	return new BraidAddress(address.userid, address.domain, omitResource ? null : address.resource);
}

if (typeof module !== 'undefined') {
	module.exports = {
		BraidAddress : BraidAddress,
		newAddress : newAddress
	};
}
