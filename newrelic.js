/**
 * New Relic agent configuration.
 * 
 * See lib/config.defaults.js in the agent distribution for a more complete description of configuration variables and their potential values.
 */
exports.config = {
	/**
	 * Array of application names.
	 */
	app_name : [ 'braid-server' ],
	/**
	 * Your New Relic license key.
	 */
	license_key : '5ebfa1347b925e98a488676d1ed8d3a6048dfe09',
	logging : {
		/**
		 * Level at which to log. 'trace' is most useful to New Relic when diagnosing issues with the agent, 'info' and higher will impose the least overhead on
		 * production applications.
		 */
		level : 'info'
	},
	agent_enabled : true
}
