const { writeFileSync, existsSync, readFileSync, openSync } = require('fs');

const translator = require('@vitalets/google-translate-api');

const settings = require('./settings');

const blue = (str: string): string => '\033[1;34m' + str + '\033[1;0m';
const green = (str: string): string => '\033[1;32m' + str + '\033[1;0m';
const magenta = (str: string): string => '\033[1;35m' + str + '\033[1;0m';

const debug = (text: string): void => {
	if (settings.debug) {
		return console.log(`[ ${magenta('Translator')} ] ${text}`);
	}
};

debug(`${blue('$')} Welcome to the ${green('Translation Service')}`);

const translatorError = (text: string): void => {
	throw new Error(`[ Translator ] ${text}`);
};

const wait = (time: number): Promise<any> =>
	new Promise((resolve: any) => setTimeout(resolve, time));

const main = async (): Promise<void> => {
	const rootLangCode = settings.rootLangCode;

	debug(
		`[ ${blue('main')} ] Starting root translation service (${green(
			rootLangCode
		)})`
	);

	const rootFilePath = settings.rootLangFile;

	if (!existsSync(rootFilePath))
		return translatorError(
			'[ main ] Invalid path provided on rootLangFile.'
		);

	debug(`[ ${blue('main')} ] Opening root file: ${green(rootFilePath)}`);

	const rootFileContent = readFileSync(rootFilePath, 'utf8');

	let rootFileObject = null;

	try {
		rootFileObject = JSON.parse(rootFileContent);
	} catch {
		return translatorError(
			`[ main ] The content in the root file ${rootFilePath} is not a valid JSON object.`
		);
	}

	if (!rootFileObject)
		return translatorError('[ main ] Invalid root file object.');

	for (const langCode of settings.outputLangs) {
		debug(
			`[ ${blue(rootLangCode)} => ${blue(
				langCode
			)} ] Starting translation service (${green(langCode)})`
		);

		const filePath = `${settings.langPath}${langCode}.json`;

		if (!existsSync(filePath)) {
			debug(
				`[ ${blue(rootLangCode)} => ${blue(
					langCode
				)} ] Creating file: ${green(filePath)}`
			);

			await writeFileSync(filePath, '{}');
		}

		debug(
			`[ ${blue(rootLangCode)} => ${blue(
				langCode
			)} ] Opening file: ${green(filePath)}`
		);

		const fileContent = readFileSync(filePath, 'utf8');

		let fileObject = null;

		try {
			fileObject = JSON.parse(fileContent);
		} catch {
			return translatorError(
				`[ ${rootLangCode} => ${langCode} ] The content in the file ${filePath} is not a valid JSON object.`
			);
		}

		if (!fileObject)
			return translatorError(
				`[ ${rootLangCode} => ${langCode} ] Invalid file object.`
			);

		const rootFileObjPath = {};

		deepMap(fileObject, ['root'], rootFileObjPath);

		const result = await translate(
			rootFileObject,
			rootLangCode,
			langCode,
			['root'],
			rootFileObjPath
		);

		debug(
			`[ ${blue(rootLangCode)} => ${blue(
				langCode
			)} ] Translation ended for ${green(langCode)}`
		);

		await writeFileSync(filePath, JSON.stringify(result, null, 2));
	}
};

const isString = (val: any): boolean => typeof val === 'string';

const isObject = (val: any): boolean =>
	val === Object(val) &&
	Object.prototype.toString.call(val) !== '[object Array]';

const isArray = (val: any): boolean => Array.isArray(val);

const translateString = async (
	text: string,
	fromLangCode: string,
	toLangCode: string,
	rootObjPath: string[],
	rootFileObjPath: any
): Promise<string> => {
	const rootText = rootFileObjPath[rootObjPath.join('')];

	if (rootText && rootText !== 'untranslated') {
		debug(
			`[ ${blue(fromLangCode)} => ${blue(toLangCode)} ] [ ${magenta(
				'skipped'
			)} ] ${green(rootObjPath.join(''))} ==> ${blue(rootText)}`
		);

		return rootText;
	} else {
		debug(
			`[ ${blue(fromLangCode)} => ${blue(
				toLangCode
			)} ] Starting translation for ${green(
				rootObjPath.join('')
			)} ==> ${blue(text)}`
		);

		await wait(settings.translateDelay);

		const result = await translator(text, {
			from: fromLangCode,
			to: toLangCode
		});

		debug(
			`[ ${blue(fromLangCode)} => ${blue(
				toLangCode
			)} ] Translation ended for ${green(
				rootObjPath.join('')
			)} ==> ${blue(result.text)}`
		);

		return result.text;
	}
};

const translateObject = async (
	object: any,
	fromLangCode: string,
	toLangCode: string,
	rootObjPath: string[],
	rootFileObjPath: any
): Promise<any> => {
	const result = {};

	let iteration = 0;

	const entries = Object.entries(object);

	for (const [key, value] of entries) {
		if (iteration === 0) {
			rootObjPath.push(`['${key}']`);
		} else {
			rootObjPath.splice(rootObjPath.length - 1, 1);
			rootObjPath.push(`['${key}']`);
		}

		const translatedValue = await translate(
			value,
			fromLangCode,
			toLangCode,
			rootObjPath,
			rootFileObjPath
		);
		result[key] = translatedValue;

		iteration = iteration + 1;

		if (iteration == entries.length) {
			rootObjPath.splice(rootObjPath.length - 1, 1);
		}
	}

	return result;
};

const translateArray = async (
	array: any[],
	fromLangCode: string,
	toLangCode: string,
	rootObjPath: string[],
	rootFileObjPath: any
): Promise<any[]> => {
	const result = [];

	let iteration = 0;

	for (const value of array) {
		if (iteration === 0) {
			rootObjPath.push(`[${iteration}]`);
		} else {
			rootObjPath.splice(rootObjPath.length - 1, 1);
			rootObjPath.push(`[${iteration}]`);
		}

		const translatedValue = await translate(
			value,
			fromLangCode,
			toLangCode,
			rootObjPath,
			rootFileObjPath
		);

		result.push(translatedValue);

		iteration = iteration + 1;

		if (iteration == array.length) {
			rootObjPath.splice(rootObjPath.length - 1, 1);
		}
	}

	return result;
};

const translate = async (
	source: any,
	fromLangCode: string,
	toLangCode: string,
	rootObjPath: string[],
	rootFileObjPath: any
): Promise<any> => {
	if (isString(source))
		return translateString(
			source,
			fromLangCode,
			toLangCode,
			rootObjPath,
			rootFileObjPath
		);

	if (isObject(source))
		return translateObject(
			source,
			fromLangCode,
			toLangCode,
			rootObjPath,
			rootFileObjPath
		);

	if (isArray(source))
		return translateArray(
			source,
			fromLangCode,
			toLangCode,
			rootObjPath,
			rootFileObjPath
		);

	return translatorError(
		`[ ${fromLangCode} => ${toLangCode} ] Unknown type for the source provided.`
	);
};

const deepString = (
	text: string,
	rootObjPath: string[],
	rootFileObjPath: any
): string => {
	rootFileObjPath[rootObjPath.join('')] = text;

	return text;
};

const deepObject = (
	object: any,
	rootObjPath: string[],
	rootFileObjPath: any
): any => {
	const result = {};

	let iteration = 0;

	const entries = Object.entries(object);

	for (const [key, value] of entries) {
		if (iteration === 0) {
			rootObjPath.push(`['${key}']`);
		} else {
			rootObjPath.splice(rootObjPath.length - 1, 1);
			rootObjPath.push(`['${key}']`);
		}

		const deepValue = deepMap(value, rootObjPath, rootFileObjPath);
		result[key] = deepValue;

		iteration = iteration + 1;

		if (iteration == entries.length) {
			rootObjPath.splice(rootObjPath.length - 1, 1);
		}
	}

	return result;
};

const deepArray = (
	array: any[],
	rootObjPath: string[],
	rootFileObjPath: any
): any[] => {
	const result = [];

	let iteration = 0;

	for (const value of array) {
		if (iteration === 0) {
			rootObjPath.push(`[${iteration}]`);
		} else {
			rootObjPath.splice(rootObjPath.length - 1, 1);
			rootObjPath.push(`[${iteration}]`);
		}

		const deepValue = deepMap(value, rootObjPath, rootFileObjPath);

		result.push(deepValue);

		iteration = iteration + 1;

		if (iteration == array.length) {
			rootObjPath.splice(rootObjPath.length - 1, 1);
		}
	}

	return result;
};

const deepMap = (
	source: any,
	rootObjPath: string[],
	rootFileObjPath: any
): any => {
	if (isString(source))
		return deepString(source, rootObjPath, rootFileObjPath);

	if (isObject(source))
		return deepObject(source, rootObjPath, rootFileObjPath);

	if (isArray(source)) return deepArray(source, rootObjPath, rootFileObjPath);

	return translatorError('[ MAP ] Unknown type for the source provided.');
};

main();
