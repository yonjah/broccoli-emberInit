"use strict";
var fs         = require('fs'),
	path       = require('path'),
	Writer     = require('broccoli-writer'),
	helpers    = require('broccoli-kitchen-sink-helpers'),
	mkdirp     = require('mkdirp'),
	modulesLoc = 'modules',
	emberTypes = ['hbs_template', 'template', 'model', 'component', 'controller', 'adapter', 'helper', 'initializer',
				'mixin', 'route', 'serializer', 'transform', 'util', 'view'],
	typeRegex = new RegExp('(' + emberTypes.map(camelizeStr).join('|')  +')$');



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
		}),
		outputFile = this.outputFile,
		outputDir  = path.dirname(outputFile),
		components = {},
		output     = {
			app     : 'import App from \'app\';\n ', //+
				// 'import Handlebars from \'handlebars\';\n'+
				// 'Handlebars.TEMPLATES = Handlebars.TEMPLATES || {};\n',
			helpers : '',
			modules : 'import Ember from \'ember\';\n'
		},
		resolvedOutputFile = path.join(destDir, outputFile);

	mkdirp.sync(path.join(destDir, outputDir));

	resolvedOutputFile = path.join(destDir, outputFile);

	files.filter(moveAndparseModules.bind(this, srcDir, destDir, output))
		.filter(parseComponents.bind(this, output, components))
		.filter(parseApp.bind(this, output, components));

	output.app += 'export default App;';

	fs.writeFileSync(resolvedOutputFile, output.modules + output.helpers + output.app, {encoding:'utf8'});
};

function parseApp (output, components, file) {
	var name, emberType, emberName;
	name = file.substring(0, file.length - 3);
	emberType = getEmberType(name);
	if (!emberType) { //this should not happen since app files are the last to be parsed
		throw new Error('not part of ember App ' + file);
	}
	emberName = getEmberName(components, emberType, name);
	switch (emberType){
		case 'helper':
			output.helpers += genLoadCode(emberName, name, 'Ember');
			break;
		// case 'hbs_template':
		// 	output.app += 'import ' + emberName + ' from \'' + name + '\';\n';
		// 	output.app += "Handlebars.TEMPLATES['" + getTemplateName(name) + "'] = " + emberName + ';\n';
		// 	break;
		case 'view':
			output.app += genComponentViewCode(emberName, name, 'App');
			break;
		case 'template':
			output.app += 'import ' + emberName + ' from \'' + name + '\';\n';
			output.app += "Ember.TEMPLATES['" + getTemplateName(name, emberName) + "'] = " + emberName + ';\n';
			break;
		case 'initializer':
			output.app += 'import ' + emberName + ' from \'' + name + '\';\n';
			output.app += "Ember.Application.initializer(" + emberName + ");\n";
			break;
		default:
			output.app += genLoadCode(emberName, name, 'App');
	}
	return false;
}

function parseComponents (output, components, file) {
	var name, emberType, emberName;
	name = file.substring(0, file.length - 3);
	emberType = getEmberType(name);
	if (emberType !== 'component') { //it's not a component pass to next parser
		return true;
	}
	emberName = getEmberName(components, emberType, name);
	output.app += genLoadCode(emberName, name, 'App');
	return false;
}

function moveAndparseModules (srcDir, destDir, output, file) {
	var name,
		moveTo = path.join(destDir, file);

	mkdirp.sync(path.dirname(moveTo));
	fs.renameSync(path.join(srcDir, file), moveTo);
	if (file == 'app.js' || file.indexOf('.js') !== (file.length - 3) ) {
		return false;
	}
	name = file.substring(0, file.length - 3);
	if (getEmberType(name)) { //it's not a module pass to next parser
		return true;
	}
	output.modules += 'import \'' + name + '\';\n';
	return false;
}

function genComponentViewCode (name, location, scope) {
	var result = '',
		parts, last, componentName;
	if (name.indexOf('Components') !== 0) {
		return genLoadCode(name, location, scope);
	}

	parts = location.replace(/-/g,'/').split('/');
	last  = parts.pop();
	last  =  camelizeStr(last.replace('View', ''));
	componentName = camelize(parts.concat('component'));
	result += 'import ' + name + ' from \'' + location + '\';\n';
	// result += componentName +'.' + last + ' = ' + name + ';\n';
	result += componentName +'.reopen({' + last + ' : ' + name + '});\n';
	return result;
}

function genLoadCode (name, location, scope) {
	var result = '';
	result += 'import ' + name + ' from \'' + location + '\';\n';
	result += scope + '.' + name + ' = ' + name + ';\n';
	return result;
}

function getEmberType (name) {
	var parts = name.split('/'),
		first = parts[0],
		last  = parts[parts.length -1],
		match,
		index = -1;

	if (parts[0] === modulesLoc) { // exclude all modules from having a type
		return;
	}
	if (first[first.length - 1] === 's') {
		index = emberTypes.indexOf(first.substring(0, first.length - 1));
	}

	if (index === -1) {
		index = emberTypes.indexOf(last);
	}

	if (index >= 0) {
		return emberTypes[index];
	}

	match = typeRegex.exec(last);
	return match && match[0].toLowerCase();
}

function getEmberName (components, type, name) {
	var parts = name.replace(/-/g,'/').split('/'),
		first = parts[0],
		last  = parts.pop(),
		result  = '';

	if (	first === type ||
				(first[first.length - 1] === 's' &&
				emberTypes.indexOf(first.substring(0, first.length - 1)) >= 0)
			) {
		parts.shift();
		parts.push(last);
		last = type;
	}
	// 'template', 'model', 'component', 'controller', 'adapter', 'helper',
	// 'initializer', 'mixin', 'route', 'serializer', 'transform', 'util', 'view'
	result = camelize(parts);
	if (components[result]) {
		result = 'Components' + result;
	}

	if (typeRegex.exec(last)) {
		result += camelizeStr(last.replace(typeRegex, ''));
		last = type;
	}

	switch (type){
		case 'model':
			break;
		case 'component':
			components[result] = true;
			/* falls through*/
		default:
			result += camelizeStr(last);
	}
	return result;
}

function getTemplateName(name, emberName) {
	var parts = name.split('/'),
		res   = '',
		last  = '';

	if (parts[0] === 'templates' || parts[0] === 'hbs_templates') {
		parts.shift();
	} else {
		last = parts.pop();
		if (last === 'template') {
			last = '';
		}
	}

	if (parts[0] !== 'components' && emberName.indexOf('Components') === 0) {
		res = 'components/' + parts.join('-');
	}
	if (!res) {
		res = parts.join('/');
	}

	if (last.indexOf('Template') + 8 === last.length) {
		res += (res ? '/' :'') + last.replace('Template', '');
	} else if (last) {
		res += (res ? '/' :'') + last;
	}
	return res;
}

function camelize (arr) {
	return arr.map(camelizeStr).join('');
}

function camelizeStr (str) {
	return str[0].toUpperCase() + str.substring(1);
}

module.exports = EmberInit;