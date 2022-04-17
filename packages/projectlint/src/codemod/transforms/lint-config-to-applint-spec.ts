import path from 'path';
import semver from 'semver';
import type { API, FileInfo, Options } from 'jscodeshift';

interface PackageJSON {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
}

interface LintConfig {
  configFiles: string[];
  name: string;
  version: string;
  scripts: Record<string, string>;
  removedDependencyReg: RegExp;
}

const packageName = '@applint/spec';
const packageVersion = '^1.0.0';
const deprecatedDeps = ['@iceworks/spec', '@ice/spec'];
const eslintConfig: LintConfig = {
  configFiles: [
    '.eslintrc.js',
    '.eslintrc',
    '.eslintrc.json',
  ],
  name: 'eslint',
  version: '^8.0.0',
  removedDependencyReg: /eslint-.*/g,
  scripts: {
    eslint: 'eslint --ext .js,.jsx,.ts,.tsx ./',
    'eslint:fix': 'eslint --ext .js,.jsx,.ts,.tsx ./ --fix',
  },
};
const stylelintConfig: LintConfig = {
  configFiles: [
    '.stylelintrc.js',
    '.stylelintrc',
    '.stylelintrc.json',
  ],
  name: 'stylelint',
  version: '^14.0.0',
  removedDependencyReg: /stylelint-.*/g,
  scripts: {
    stylelint: 'stylelint **/*.{css,scss,less}',
    'stylelint:fix': 'stylelint **/*.{css,scss,less} --fix',
  },
};

export default function (fileInfo: FileInfo, api: API, options: Options) {
  const { path: filePath, source } = fileInfo;
  const dir = path.dirname(filePath);
  const basename = path.basename(filePath);

  if (basename !== 'package.json') {
    return source;
  }

  let originalPackageJSON = JSON.parse(source);
  let packageJSON = originalPackageJSON;
  const deprecatedDep = findDeprecatedDep(packageJSON);
  packageJSON = addAppLintSpecToDevDependency(packageJSON, deprecatedDep);

  packageJSON = handleLintConfig(packageJSON, eslintConfig);
  packageJSON = handleLintConfig(packageJSON, stylelintConfig);

  return JSON.stringify(packageJSON);
}

function addAppLintSpecToDevDependency(packageJSON: PackageJSON, deprecatedDep: string): PackageJSON {
  if (!deprecatedDep) {
    // 如果 @applint/spec 已经存在, 不需要修改 devDependencies
    return packageJSON;
  }

  // 从 package.json 删除废弃的 npm 包
  const { dependencies = {}, devDependencies = {} } = packageJSON;
  const dependencyObj: Record<string, Record<string, string>> = { dependencies, devDependencies };
  for (const key in dependencyObj) {
    const currentDependencies = dependencyObj[key];
    if (deprecatedDep in currentDependencies) {
      delete currentDependencies[deprecatedDep];
    }
  }

  // 添加 @applint/spec 到 package.json 的 devDependencies 对象
  const newPackageJSON = { ...packageJSON };
  newPackageJSON['devDependencies'] = { ...devDependencies, [packageName]: packageVersion };

  return newPackageJSON;
}

/**
 * 寻找废弃的依赖
 * @param packageJSON
 * @returns 如果返回空字符串，说明没找到废弃依赖；否则找到 deprecatedDeps 数组中的一个
 */
function findDeprecatedDep(packageJSON: PackageJSON) {
  const { dependencies = {}, devDependencies = {} } = packageJSON;
  return Object.keys(Object.assign({}, dependencies, devDependencies)).find(dep => deprecatedDeps.includes(dep)) || '';
}

/**
 * 添加或修改配置文件、scripts 脚本、依赖包
 */
function handleLintConfig(packageJSON: PackageJSON, lintConfig: LintConfig) {
  const { scripts, name, removedDependencyReg, version } = lintConfig;
  let newPackageJSON = { ...packageJSON };

  // 1. 处理 scripts 脚本
  const existedScripts = findExistedScripts(name, packageJSON);
  // 如果已经存在 eslint/stylelint 等用户有自定义的脚本，比如 "eslint ./" 不需要增加
  if (!Object.keys(existedScripts).length) {
    // 如果没有脚本，则新增新的脚本
    newPackageJSON.scripts = { ...(packageJSON.scripts || {}), ...scripts };
  }

  // 2. 添加 eslint/stylelint 等依赖到 devDependencies
  newPackageJSON = addDepToDevDeps(newPackageJSON, name, version);

  // 3. 移除 lint 插件包、规则包等
  newPackageJSON = removeDependencies(removedDependencyReg, newPackageJSON);

  return newPackageJSON;
}

/**
 * 根据 cli 的名称找到已存在的脚本
 * @param cliName
 */
function findExistedScripts(cliName: string, packageJSON: PackageJSON) {
  const { scripts = {} } = packageJSON;
  const existedScripts: Record<string, string> = {};
  for (const key of Object.keys(scripts)) {
    const script = scripts[key];
    if (RegExp(cliName).test(script)) {
      existedScripts[key] = script;
    }
  }
  return existedScripts;
}

function removeDependencies(reg: RegExp, originalPackageJSON: PackageJSON) {
  const packageJSON: PackageJSON = { ...originalPackageJSON };
  const { dependencies = {}, devDependencies = {} } = packageJSON;
  const dependencyObj: Record<string, Record<string, string>> = { dependencies, devDependencies };
  for (const key in dependencyObj) {
    const currentDependencies = dependencyObj[key];
    for (const dependency of Object.keys(currentDependencies)) {
      if (reg.test(dependency)) {
        delete currentDependencies[dependency];
      }
    }
    if (Object.keys(currentDependencies).length) {
      packageJSON[key as keyof PackageJSON] = currentDependencies;
    } else {
      delete packageJSON[key as keyof PackageJSON];
    }
  }

  return packageJSON;
}

function addDepToDevDeps(packageJSON: PackageJSON, dep: string, version: string) {
  const { devDependencies = {} } = packageJSON;
  const sourceDepMajor = semver.minVersion(devDependencies[dep])?.major;
  const targetDepMajor = semver.minVersion(version)?.major;
  /**
   * 如果目标依赖版本是 ^8.0.0， devDependencies[dep] 主版本小于它才需要更新依赖。
   * 比如 ^7.0.0，需要更新依赖，^8.0.0、^8.12.0、^9.0.0 不需要更新依赖
   */
  if (devDependencies[dep] && sourceDepMajor && targetDepMajor && targetDepMajor <= sourceDepMajor) {
    return packageJSON;
  }
  const newPackageJSON = { ...packageJSON };
  newPackageJSON['devDependencies'] = { ...packageJSON.devDependencies, [dep]: version };
  return newPackageJSON;
}
