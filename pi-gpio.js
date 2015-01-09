"use strict";
var fs = require("fs"),
	path = require("path"),
	exec = require("child_process").exec,
  q = require("q");

var gpioAdmin = "gpio-admin",
	sysFsPath = "/sys/devices/virtual/gpio";

var rev = fs.readFileSync("/proc/cpuinfo").toString().split("\n").filter(function(line) {
	return line.indexOf("Revision") == 0;
})[0].split(":")[1].trim();

rev = parseInt(rev, 16) < 3 ? 1 : 2; // http://elinux.org/RPi_HardwareHistory#Board_Revision_History

var pinMapping = {
	"3": 0,
	"5": 1,
	"7": 4,
	"8": 14,
	"10": 15,
	"11": 17,
	"12": 18,
	"13": 21,
	"15": 22,
	"16": 23,
	"18": 24,
	"19": 10,
	"21": 9,
	"22": 25,
	"23": 11,
	"24": 8,
	"26": 7,

	// Model A+ and Model B+ pins
	"29": 5,
	"31": 6,
	"32": 12,
	"33": 13,
	"35": 19,
	"36": 16,
	"37": 26,
	"38": 20,
	"40": 21
};

if (rev == 2) {
	pinMapping["3"] = 2;
	pinMapping["5"] = 3;
	pinMapping["13"] = 27;
}

function isNumber(number) {
	return !isNaN(parseInt(number, 10));
}

function noop() {}

function handleExecResponse(method, pinNumber, callback) {
	return function(err, stdout, stderr) {
		if (err) {
			console.error("Error when trying to", method, "pin", pinNumber);
			console.error(stderr);
			callback(err);
		} else {
			callback();
		}
	}
}

function sanitizePinNumber(pinNumber) {
	if (!isNumber(pinNumber) || !isNumber(pinMapping[pinNumber])) {
		throw new Error("Pin number isn't valid");
	}

	return parseInt(pinNumber, 10);
}

function sanitizeDirection(direction) {
	direction = (direction || "").toLowerCase().trim();
	if (direction === "in" || direction === "input") {
		return "in";
	} else if (direction === "out" || direction === "output" || !direction) {
		return "out";
	} else {
		throw new Error("Direction must be 'input' or 'output'");
	}
}

function sanitizeOptions(options) {
	var sanitized = {};

	options.split(" ").forEach(function(token) {
		if (token == "in" || token == "input") {
			sanitized.direction = "in";
		}

		if (token == "pullup" || token == "up") {
			sanitized.pull = "pullup";
		}

		if (token == "pulldown" || token == "down") {
			sanitized.pull = "pulldown";
		}
	});

	if (!sanitized.direction) {
		sanitized.direction = "out";
	}

	if (!sanitized.pull) {
		sanitized.pull = "";
	}

	return sanitized;
}

var gpio = {
	rev: rev,

	open: function(pinNumber, options, callback) {
    var deferred = q.defer();
		pinNumber = sanitizePinNumber(pinNumber);

		if (!callback && typeof options === "function") {
			callback = options;
			options = "out";
		}

		options = sanitizeOptions(options);

		exec(gpioAdmin + " export " + pinMapping[pinNumber] + " " + options.pull, handleExecResponse("open", pinNumber, function (error) {
			if (error) {
        (callback || noop)(error);
        deferred.reject(new Error(error));
      } else {
        gpio.setDirection(pinNumber, options.direction, callback);
        deferred.resolve();
      }
		}));

    return deferred.promise;
	},

	setDirection: function(pinNumber, direction, callback) {
    var deferred = q.defer();
		pinNumber = sanitizePinNumber(pinNumber);
		direction = sanitizeDirection(direction);

		fs.writeFile(sysFsPath + "/gpio" + pinMapping[pinNumber] + "/direction", direction, function (error) {
      (callback || noop)(error);
      if (error) {
        deferred.reject(new Error(error));
      } else {
        deferred.resolve();
      }
    });
    return deferred.promise;
	},

	getDirection: function(pinNumber, callback) {
    var deferred = q.defer();
		pinNumber = sanitizePinNumber(pinNumber);

		fs.readFile(sysFsPath + "/gpio" + pinMapping[pinNumber] + "/direction", "utf8", function(err, direction) {
			if (err) {
        (callback || noop)(err);
        deferred.reject(new Error(err));
      } else {
        var sanitizedDirection = sanitizeDirection(direction.trim());
        (callback || noop)(null, sanitizedDirection);
        deferred.resolve(sanitizedDirection);
      }
		});
    return deferred.promise;
	},

	close: function(pinNumber, callback) {
    
		pinNumber = sanitizePinNumber(pinNumber);

		exec(gpioAdmin + " unexport " + pinMapping[pinNumber], handleExecResponse("close", pinNumber, callback || noop));
	},

	read: function(pinNumber, callback) {
    var deferred = q.defer();
		pinNumber = sanitizePinNumber(pinNumber);

		fs.readFile(sysFsPath + "/gpio" + pinMapping[pinNumber] + "/value", function(err, data) {
			if (err) {
        (callback || noop)(err);
        deferred.reject(err);
        return;
      } else {
        var dataInt = parseInt(data, 10);
        (callback || noop)(null, dataInt);
        deferred.resolve(dataInt);
      }
		});
    return deferred.promise;
	},

	write: function(pinNumber, value, callback) {
    var deferred = q.defer();
		pinNumber = sanitizePinNumber(pinNumber);

		value = !!value ? "1" : "0";

		fs.writeFile(sysFsPath + "/gpio" + pinMapping[pinNumber] + "/value", value, "utf8", function (error) {
      (callback || noop)(error);
      if (error) {
        deferred.reject(new Error(error));
      } else {
        deferred.resolve();
      }
    });
    return deferred.promise;
	}
};

gpio.export = gpio.open;
gpio.unexport = gpio.close;

module.exports = gpio;
