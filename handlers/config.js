"use strict";
const WebdaServer = require("./http");
const Executor = require("webda/services/executor");
const Webda = require("webda/core");
const _extend = require("util")._extend;
const fs = require("fs");
const path = require("path");

class ConfigurationService extends Executor {

	init(config) {
		config['/api/modda'] = {"method": ["GET"], "executor": this._name, "_method": this.getServices};
		config['/api/services'] = {"method": ["GET"], "executor": this._name, "_method": this.crudService};
		config['/api/services/{name}'] = {"method": ["PUT", "DELETE", "POST"], "executor": this._name, "_method": this.crudService};
		config['/api/routes'] = {"method": ["GET", "POST", "PUT", "DELETE"], "executor": this._name, "_method": this.crudRoute};
		config['/api/deployments'] = {"method": ["GET", "POST"], "executor": this._name, "_method": this.restDeployment};
		config['/api/deployments/{name}'] = {"method": ["DELETE", "PUT"], "executor": this._name, "_method": this.restDeployment};
		config['/api/vhosts'] = {"method": ["POST", "GET"], "executor": this._name, "_method": this.getVhosts};
		config['/api/configs'] = {"method": ["GET"], "executor": this._name, "_method": this.getConfig};
		config['/api/configs/{vhost}'] = {"method": ["PUT"], "executor": this._name, "_method": this.updateCurrentVhost};
		config['/api/browse/{path}'] = {"method": ["GET", "PUT", "DELETE"], "executor": this._name, "_method": this.fileBrowser, 'allowPath': true};
		config['/{path}'] = {"method": ["GET"], "executor": this._name, "_method": this.uiBrowser, 'allowPath': true};
		this.refresh();
	}

	refresh() {
		this._config = this._webda.config[this._webda._currentVhost];
		this._computeConfig = this._webda.computeConfig[this._webda._currentVhost];
		this._depoyments = {};
	}

	uiBrowser() {
		if (this._params.path == undefined || this._params.path == '') {
			this._params.path = "index.html";
		}
		this.fileBrowser(__dirname + "/../app/");
	}

	fileBrowser(prefix) {
		
		if (this._params.path.indexOf("..") >= 0 || this._params.path[0] == '/') {
			// For security reason prevent the .. or /
			throw 403;
		}

		var path = prefix + this._params.path;
		var stat;
		if (fs.existsSync(path)) {
			stat = fs.statSync(path);
		}
		 
		if (this._route._http.method === "GET") {
			if (stat == undefined) {
				throw 404;
			}
			// Handle directory ?
			if (stat.isDirectory()) {
				return this.write(fs.readdirSync(path));
			} else {
				return this.write(fs.readFileSync(path));
			}
		} else if (this._route._http.method === "PUT") {
			if (stat !== undefined && stat.isDirectory()) {
				throw 400;
			}
			// Try to create folders if they dont exists
			// TODO Code it or use mkdirp
			// Could handle the 
			fs.writeFileSync(path, this.body);
			return;
		} else if (this._route._http.method === "DELETE") {
			if (!fs.existsSync(path)) {
				throw 404;
			}
			if (stat.isDirectory()) {
				throw 400;
			}
			fs.unlinkSync(path);
			return;
		}
	}

	getServices() {
		this.write(this._webda.services);
	}

	toPublicJSON(o) {
		return JSON.stringify(o);
	}

	crudService() {
		if (this._route._http.method === "GET") {
			var services = [];
			for (let i in this._config.global.services) {
				let service = this._config.global.services[i];
				service._name = i;
				service._type = "Service";
				services.push(service);
			}
			services.sort( function (a,b) {
				return a._name.localeCompare(b._name);
			});
			this.write(services);
			return;
		}
		let name = this._params.name;
		if (this._route._http.method === "DELETE") {
			delete this._config.global.services[name];
			this.save();
			return;	
		}
		let service = this._config.global.services[name];
		this.cleanBody();
		if (this._route._http.method === "POST" && service != null) {
			throw 409;
		}
		this._config.global.services[name]=this.body;
		this.save();
	}

	save() {
		this._webda.saveHostConfiguration(this._config);
	}

	cleanBody() {
		for (let i in this.body) {
			if (i.startsWith("_")) {
				delete this.body[i];
			}
		}
	}

	crudRoute() {
		if (this._route._http.method === "GET") {
			var routes = [];
			for (let i in this._computeConfig) {
				if (!i.startsWith("/")) continue;
				let route = this._computeConfig[i];
				route._name = i;
				route._type = "Route";
				route["_uri-template-parse"]=undefined;
				if (route.params === undefined) {
					route.params = {};
				}
				// Check if it is a manual route or not
				route._manual = this._config[i] !== undefined;
				routes.push(route);
			}
			routes.sort( function (a,b) {
				if (a["_manual"] && !b["_manual"]) {
					return -1;
				} else if (!a["_manual"] && b["_manual"]) {
					return 1;
				}
				return a._name.localeCompare(b._name);
		    });
			this.write(routes);
			return;
		}
		// TODO Check query string
		if (this._route._http.method === "DELETE") {
			if (!this.body.url) {
				throw 400;
			}
			delete this._config[this.body.url];
			this.save();
			return;
		}
		var url = this.body._namel;
		this.cleanBody();
		return;
		if (this._route._http.method === "POST" && this._config[url] != null) {
			throw 409;
		}
		this._config[url] = this.body;
		this.save();
	}

	getVhosts() {
		this.write(Object.keys(this._webda.config));
	}

	getConfig() {
		this.write(this._webda.config[this._params.vhost]);
	}

	updateCurrentVhost() {
		// For later use
	}

	restDeployment() {
		if (this._route._http.method == "GET") {
			return this.getService("deployments").find().then ( (deployments) => { 
				for (let i in deployments) {
					// Clone the object for now
					this._depoyments[deployments[i].uuid]=true;
					deployments[i]._name = deployments[i].uuid;
					deployments[i]._type = "Deployment";
				}
				deployments.sort(function (a,b) {return a._name.localeCompare(b._name);});
				deployments.splice(0,0,{"uuid":"Global","_type": "Configuration","_name": "Global","params":this._config.global.params});
				this._depoyments["Global"]=true;
				this.write(deployments);
			});
		} else if (this._route._http.method == "POST") {
			if (this._depoyments[this.body.uuid]) {
				throw 409;
			}
			return this._webda.getService("deployments").save(this.body);
		} else if (this._http.method == "PUT") {
			this.cleanBody();
			if (this._http.url.startsWith("/deployments") && this.params.vhost !== undefined) {
				return this._webda.getService("deployments").update(this.body);
			}
		} else if (this._http.method == "DELETE") {
			if (!this._depoyments[this._params.name] || this._params.name === "Global") {
				throw 409;
			}
			return this._webda.getService("deployments").delete(this._params.name).then ( () => {
				delete this._depoyments[this._params.name];
			});
		}
	}
}

var ServerConfig = {
	"*": "localhost",
	localhost: {
		global: {
			services: {
				deployments: {
					expose: {},
					folder: './deployments',
					type: 'FileStore',
					lastUpdate: false
				},
				configuration: {
					require: ConfigurationService
				}
			}
		}
	}
};

class WebdaConfigurationServer extends WebdaServer {

	constructor (config) {
		super(config);
		this.initAll();
		this._vhost = 'localhost';
		this._deployers = {};
		this._deployers["aws"] = require("../deployers/aws");
		this._deployers["docker"] = require("../deployers/aws");
	}

	exportJson(o) {
		// Credit to : http://stackoverflow.com/questions/11616630/json-stringify-avoid-typeerror-converting-circular-structure-to-json
		var cache = [];
		var res = JSON.stringify(o, function(key, value) {
			if (key.startsWith("_")) return;
		    if (typeof value === 'object' && value !== null) {
		        if (cache.indexOf(value) !== -1) {
		            // Circular reference found, discard key
		            return;
		        }
		        // Store value in our collection
		        cache.push(value);
		    }
		    return value;
		}, 4);
		cache = null; // Enable garbage collection
		return res;
	}

	saveHostConfiguration(config) {
		this.config[this._currentVhost]=config;
		fs.writeFileSync(this._file, "module.exports=" + this.exportJson(this.config));
		delete this._mockWedba;
		this.loadMock(JSON.parse(this.exportJson(this.config)));
		this.getService("configuration").refresh();
	}

	loadMock(config) {
		if (config !== undefined) {
			// We just saved the configuration dont want to reload it
		} else if (fs.existsSync("./webda.config.js")) {
			this._file = "./webda.config.js";
			this.config = fs.readFileSync(this._file, {encoding:'utf8'}).replace("module.exports", "");
			this.config = JSON.parse(this.config.substr(this.config.indexOf("=") + 1));
		} else {
			console.log("No file is present, creating webda.config.js")
			this.config = {};
			this._file = path.resolve("./webda.config.js");
			this._currentVhost = "changeme.webda.io";
			this.config["*"] = this._currentVhost;
			this.saveHostConfiguration({global:{params: {}, services: {}}});
			return;
		}
		this._mockWedba = new Webda(config);
		this._currentVhost = this.getHost();
		this._mockWedba.initAll();
		this.computeConfig = this._mockWedba._config;
	}

	loadConfiguration(config) {
		this.loadMock();
		return ServerConfig;
	}

	getHost() {
		var vhost = this.config["*"];
		if (vhost === undefined) {
			for (var i in this.config) {
				vhost = i;
				break;
			}
		}
		return vhost;
	}

	deploy(env, args) {
		return this.getService("deployments").get(env).then ( (deployment) => {
			if (deployment === undefined) {
				console.log("Deployment " + env + " unknown");
				return Promise.resolve();
			}
			let host = this.getHost();
			return new this._deployers[deployment.type](host, this.computeConfig[host], deployment).deploy(args);
		});
	}

	undeploy(env, args) {
		return this.getService("deployments").get(env).then ( (deployment) => {
			if (deployment === undefined) {
				console.log("Deployment " + env + " unknown");
				return Promise.resolve();
			}
			let host = this.getHost();
			return new this._deployers[deployment.type](host, this.computeConfig[host], deployment).undeploy(args);
		});
	}

	serve (port, openBrowser) {
		super.serve(port);
		if (openBrowser || openBrowser === undefined) {
			var open = require('open');
			open("http://localhost:" + port);
		}
	}

	commandLine(args) {

		switch (args[0]) {
			case 'deploy':
				if (args[1] === undefined) {
					console.log('Need to specify an environment');
					return;
				}
				this.deploy(args[1], args.slice(2)).catch( (err) => {
					console.trace(err);
				});
				break;
			case 'undeploy':
				if (args[1] === undefined) {
					console.log('Need to specify an environment');
					return;
				}
				new this.undeploy(args[1], args.slice(2)).catch( (err) => {
					console.trace(err);
				});
				break;
			}
	}
}

module.exports = WebdaConfigurationServer