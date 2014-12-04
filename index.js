"use strict";
var fs = require('fs');
var path = require('path');
var Writer = require('broccoli-writer');
var helpers = require('broccoli-kitchen-sink-helpers');
var mkdirp = require('mkdirp');


function CjsInit(inputTree, options) {
	if (!(this instanceof CjsInit)) return new CjsInit(inputTree, options);
	options = options || {};
	this.inputTree = inputTree;

	this.files = options.files || ['**/*.js'];

	this.outputFile = options.outputFile;
	if (!this.outputFile) throw new Error('option outputFile is required');

	this.sourceMapFile = options.sourceMapFile || this.outputFile.replace(/\.js$/, '.map');

	this.sourcesContent = options.sourcesContent;

// helpers.assertAbsolutePaths([this.outputFile, this.sourceMapFile]);
}
CjsInit.prototype = Object.create(Writer.prototype);
CjsInit.prototype.constructor = CjsInit;

CjsInit.prototype.write = function (readTree, destDir) {
	var concatenate = function (srcDir) {
		return this.concatenate(srcDir, destDir);
	}.bind(this);
	return readTree(this.inputTree).then(concatenate);
};

// the sourceMappingURL is the sourceMapFile relative from the outputFile
// the "file" is the outputFile relative from the sourceMapFile
// the sources in the source map are relative from sourceMapFile
CjsInit.prototype.concatenate = function (srcDir, destDir) {
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
		var name;
		if (file == 'app.js' || file.indexOf('.js') !== (file.length - 3) ) {
			return;
		}
		name = file.substring(0, file.length - 3);
		fs.appendFileSync(resolvedOutputFile, 'import \'' + name + '\';\n', {encoding:'utf8'});
	}, this);

	fs.appendFileSync(resolvedOutputFile, 'export default App;', {encoding:'utf8'});
};

module.exports = CjsInit;