const { execFileSync } = require('child_process');
const path = require('path');

/**
 * Without a "Developer ID Application" certificate electron-builder skips
 * signing, which leaves the renamed app with a broken signature: Apple
 * Silicon Macs then call the downloaded app "damaged". Sign it ad hoc after
 * packing; when a real certificate is present, electron-builder signs over
 * this afterwards.
 */
exports.default = async function adhocSignMacos(context) {
  const { electronPlatformName, appOutDir } = context;
  if (electronPlatformName !== 'darwin') {
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(appOutDir, `${appName}.app`);

  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], {
    stdio: 'inherit',
  });
};
