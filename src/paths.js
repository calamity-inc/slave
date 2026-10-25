"use strict";

const envPaths = require("env-paths").default;

const { data, log } = envPaths("slave");
module.exports = {
	configDir: data,
	logDir: log,
};
