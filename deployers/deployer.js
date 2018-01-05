"use strict";
const _extend = require("util")._extend;

class Deployer {
  constructor(config, srcConfig, deployment) {
    this._step = 1;
    this.parameters = {};
    this.resources = {};
    this.deployment = deployment;
    this.config = config;
    this.srcConfig = srcConfig;
    for (var i in this.config) {
      if (i[0] != "/") continue;
      this.config[i]._url = i;
    }
    if (deployment === undefined) {
      throw Error("Unknown deployment");
    }

    _extend(this.parameters, config.parameters);
    _extend(this.parameters, deployment.parameters);
    _extend(this.resources, this.parameters);
    _extend(this.resources, deployment.resources);
  }

  stepper(msg) {
    console.log("[" + this._step++ + "/" + this._maxStep + "] " + msg);
  }

  deploy(args) {
    return Promise.resolve();
  }

  undeploy(args) {
    return Promise.resolve();
  }

  getServices() {
    var res = {};
    for (let i in this.config.global.services) {
      let service = this.config.global._services[i.toLowerCase()];
      if (service === undefined) {
        continue;
      }
      res[i] = service;
    }
    return res;
  }

  uninstallServices() {
    var promise = Promise.resolve();
    for (let i in this.config.global.services) {
      let service = this.config.global._services[i.toLowerCase()];
      if (service === undefined) {
        continue;
      }
      promise = promise.then(() => {
        console.log('Uninstalling service ' + i);
        return service.install(this.resources);
      });
    }
    return promise;
  }

  installServices() {
    var promise = Promise.resolve();
    let services = this.getServices();
    //console.log(this.config);
    for (let i in services) {
      let service = services[i];
      promise = promise.then(() => {
        console.log('Installing service ', i);
        return service.install(this.resources);
      });
    }
    return promise;
  }
}

module.exports = Deployer;
