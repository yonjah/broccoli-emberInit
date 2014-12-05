"use strict";
var fs        = require('fs'),
	path      = require('path'),
	Writer    = require('broccoli-writer'),
	helpers   = require('broccoli-kitchen-sink-helpers'),
	mkdirp    = require('mkdirp'),
	emberTypes = ['model', 'component', 'controller', 'adapter', 'helper', 'initializer',
				'mixin', 'route', 'serializer', 'transform', 'util', 'view'];


function EmberInit(inputTree, options) {
	if (!(this instanceof EmberInit)) return new EmberInit(inputTree, options);
	options = options || {};
	this.inputTree = inputTree;

	this.files = options.files || ['**/*.js'];

	this.outputFile = options.outputFile;
	if (!this.outputFile) throw new Error('option outputFile is required');

	this.sourceMapFile = options.sourceMapFile || this.outputFile.replace(/\.js$/, '.map');

	this.sourcesContent = options.sourcesContent;

// helpers.assertAbsolutePaths([this.outputFile, this.sourceMapFile]);
}
EmberInit.prototype = Object.create(Writer.prototype);
EmberInit.prototype.constructor = EmberInit;

EmberInit.prototype.write = function (readTree, destDir) {
	var concatenate = function (srcDir) {
		return this.concatenate(srcDir, destDir);
	}.bind(this);
	return readTree(this.inputTree).then(concatenate);
};

// the sourceMappingURL is the sourceMapFile relative from the outputFile
// the "file" is the outputFile relative from the sourceMapFile
// the sources in the source map are relative from sourceMapFile
EmberInit.prototype.concatenate = function (srcDir, destDir) {
	var files = helpers.multiGlob(this.files, {
			cwd: srcDir,
			root: srcDir,
			nomount: false  // absolute paths should be mounted at root
		}), outputFile     = this.outputFile,
		outputDir          = path.dirname(outputFile),
		resolvedOutputFile = path.join(destDir, outputFile);

	mkdirp.sync(path.join(destDir, outputDir));
	resolvedOutputFile    = path.join(destDir, outputFile);

	fs.writeFileSync(resolvedOutputFile, 'import App from \'app\';\n\n', {encoding:'utf8'});

	files.forEach(function (file, index) {
		var name, emberType, emberName, output;
		if (file == 'app.js' || file.indexOf('.js') !== (file.length - 3) ) {
			return;
		}
		name = file.substring(0, file.length - 3);
		emberType = getEmberType(name);
		if (emberType) {
			emberName = getEmberName(emberType, name);
			output = 'import ' + emberName + ' from \'' + name + '\';\n';
			output += 'App.' + emberName + ' = ' + emberName + ';\n';
		} else {
			output = 'import \'' + name + '\';\n';
		}
		fs.appendFileSync(resolvedOutputFile, output, {encoding:'utf8'});

	}, this);

	fs.appendFileSync(resolvedOutputFile, 'export default App;', {encoding:'utf8'});
};

function getEmberType (name) {
	var parts = name.split('/'),
		first = parts[0],
		last  = parts[parts.length -1],
		index;

	if (first[first.length - 1] === 's') {
		index = emberTypes.indexOf(first.substring(0, first.length - 1));
	}

	if (index === -1) {
		index = emberTypes.indexOf(last);
	}

	if (index >= 0) {
		return emberTypes[index];
	}
}

function getEmberName (type, name) {
	var parts = name.split('/'),
		last  = parts[parts.length -1];

	if (last === type) {
		parts.pop();
	} else {
		parts.shift();
	}
	// 'adapter', 'component', 'controller', 'helper', 'initializer', 'mixin',
	// 'model', 'route', 'serializer', 'transform', 'util', 'view'
	switch (type){
		case 'model':
			return camelize(parts);
		default:
			return camelize(parts.concat(type));
	}
}

function camelize (arr) {
	return arr.reduce(function (res, str) {
		return res + str[0].toUpperCase() + str.substring(1);
	}, '');
}

module.exports = EmberInit;