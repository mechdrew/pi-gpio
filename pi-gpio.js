"use strict";
var child_process = require("child_process"),
  gpioUtil = require("pi-gpioutil"),
  revision = require("./piRevision"),
  physToBcm = require("./pimMap").physToBcm,
  physToWiring = require("./pinMap").physToWiring,
  parseOptions = require("./paramParser").parseOptions,
  parseValue = require("./paramParser").parseValue,
  parseDirection = require("./paramParser").parseDirection,
  fs = require("fs"),
	path = require("path"),
	q = require("q");


var outputPins = [];
var inputPins = [];
var sysFsPath = "/sys/devices/virtual/gpio";

function noop(){};

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

var gpio = {
  rev: revision,
  read: function (physPin, callback, exportMode) {
    var deferred = q.defer();
    physPin = sanitizePinNumber(physPin);
    if (typeof callback === 'string') {
      exportMode = callback;
      callback = null;
    }

    function readVal(err) {
      if (err) {
        (callback || noop)(err);
      } else {
        fs.readFile(sysFsPath + "/gpio" + physToBcm(physPin) + "/value", "utf8", function(err, val) {
          var result = parseInt(val.trim(), 10);
          if (err) {
            deferred.reject(err);
            return (callback || noop)(err);
          } else {
            (callback || noop)(null, result);
            deferred.resolve(result);
          }
        });
      }
    }

    if ((inputPins.indexOf(physPin) === -1 && exportMode !== 'off') || exportMode === 'force') {
        this.export(physPin, "in", readVal);
    } else {
        readVal();
    }
    return deferred.promise;
  },
  write: function(physPin, value, callback, exportMode) {
    var deferred = q.defer();
    if (typeof callback === 'string') {
      exportMode = callback;
      callback = null;
    }

    function writeVal(err) {
      if (err) {
        (callback || noop)(err);
        deferred.reject(err);
      } else {
        fs.writeFile(sysFsPath + "/gpio" + physToBcm(physPin) + "/value", parseValue(value), "utf8", function (err, result) {
          (callback || noop)(err, result);
          if (err) {
            deferred.reject(err);
          } else {
            deferred.resolve(result);
          }
        });
      }
    }

    if ((outputPins.indexOf(physPin) === -1 && exportMode !== 'off') || exportMode === 'force') {
      this.export(physPin, "out", writeVal);
    } else {
      writeVal();
    }
    return deferred.promise;
  },

  export: function (physPin, optionsString, callback) {
    var deferred = q.defer();
    physPin = sanitizePinNumber(physPin);
    // allow option parameter to be omitted
    if (typeof optionsString === 'function') {
      callback = optionsString;
      optionsString = '';
    }

    var options = parseOptions(optionsString);

    gpioUtil.export(physToBcm(physPin), options.direction, function(err, stdout, stderr) {
      if (err) {
        console.error("ERROR [pi-gpio] failed to export pin " + physPin);
      }
      if (options.direction === 'in') {
        inputPins.push(physPin);
      } else if (options.direction === 'out') {
        outputPins.push(physPin);
      }

      if (typeof options.pull !== 'undefined') {
        gpioUtil.mode(physToWiring(physPin), options.pull, function (error, result) {
          (callback || noop)(error, result);
          if (error) {
            deferred.reject(error);
          } else {
            deferred.resolve(result);
          }
        });
      } else {
        (callback || noop)(err);
        deferred.reject(err);
      }
    });
    return deferred.promise;
  },
  unexport: function (physPin, callback) {
    var deferred = q.defer();
    physPin = sanitizePinNumber(physPin);
    gpioUtil.unexport(physToBcm(physPin), function(err, stdout, stderr) {
      inputPins = inputPins.filter(function(e) { return e !== physPin; });
      outputPins = outputPins.filter(function(e) { return e !== physPin; });
      (callback || noop)(err);
      if (err) {
        console.error("ERROR [pi-gpio] failed to unexport pin " + physPin);
        deferred.reject(err);
      } else {
        deferred.resolve();
      }
    });
    return deferred.promise;
  },

  getDirection: function (physPin, callback) {
    var deferred = q.defer();
    fs.readFile(sysFsPath + "/gpio" + physToBcm(physPin) + "/direction", "utf8", function(err, direction) {
      if (err) {
        return (callback || noop)(err);
        deferred.reject(new Error(err));
      }
      var sanitizedDirection = sanitizeDirection(direction.trim());
      (callback || noop)(null, sanitizedDirection);
      deferred.resolve(sanitizedDirection);
    });
    return deferred.promise;
  },

  setDirection: function (physPin, direction, callback) {
    var deferred = q.defer();
    direction = parseDirection(direction);
    fs.writeFile(sysFsPath + "/gpio" + physToBcm(physPin) + "/direction", direction, function (err, result) {
      (callback || noop)(err, result);
      if (err) {
        deferred.reject(err);
      } else {
        deferred.resolve(result);
      }
    });
    return deferred.promise;
  }
}

gpio.open  = gpio.export;
gpio.close = gpio.unexport;

module.exports = gpio;
