const { withXcodeProject } = require('expo/config-plugins');

const WIDGET_TARGET_NAME = 'ExpoWidgetsTarget';
const ASSET_CATALOG = 'Assets.xcassets';

/**
 * Adds Assets.xcassets to ExpoWidgetsTarget so the widget extension
 * can reference image assets (e.g. RzrLogo) at runtime.
 *
 * Hooks into the xcodeproj serialization by monkey-patching writeSync
 * on the xcode project to inject our changes right before disk write.
 */
module.exports = function withWidgetAssets(config) {
  return withXcodeProject(config, (mod) => {
    const proj = mod.modResults;
    const originalWriteSync = proj.writeSync.bind(proj);

    proj.writeSync = function () {
      // At this point all other withXcodeProject mods have run,
      // including expo-widgets which created the target.
      const objects = proj.hash.project.objects;
      const nativeTargets = objects['PBXNativeTarget'] || {};

      let widgetTarget = null;
      for (const key of Object.keys(nativeTargets)) {
        if (key.endsWith('_comment')) continue;
        if (nativeTargets[key].name === WIDGET_TARGET_NAME) {
          widgetTarget = nativeTargets[key];
          break;
        }
      }

      if (!widgetTarget) {
        console.warn(`[widget-assets] ${WIDGET_TARGET_NAME} not found at serialize time`);
        return originalWriteSync();
      }

      // Add file reference
      const fileRefId = 'WIDGETASSETS000001';
      objects['PBXFileReference'] = objects['PBXFileReference'] || {};
      if (!objects['PBXFileReference'][fileRefId]) {
        objects['PBXFileReference'][fileRefId] = {
          isa: 'PBXFileReference',
          lastKnownFileType: 'folder.assetcatalog',
          name: ASSET_CATALOG,
          path: ASSET_CATALOG,
          sourceTree: '"<group>"',
        };
        objects['PBXFileReference'][`${fileRefId}_comment`] = ASSET_CATALOG;
      }

      // Add to widget group
      const groups = objects['PBXGroup'] || {};
      for (const key of Object.keys(groups)) {
        if (key.endsWith('_comment')) continue;
        const group = groups[key];
        if (group.name === WIDGET_TARGET_NAME || group.path === WIDGET_TARGET_NAME) {
          if (!group.children.some((c) => c.value === fileRefId)) {
            group.children.unshift({ value: fileRefId, comment: ASSET_CATALOG });
          }
          break;
        }
      }

      // Build file
      const buildFileId = 'WIDGETASSETS000002';
      objects['PBXBuildFile'] = objects['PBXBuildFile'] || {};
      if (!objects['PBXBuildFile'][buildFileId]) {
        objects['PBXBuildFile'][buildFileId] = {
          isa: 'PBXBuildFile',
          fileRef: fileRefId,
          fileRef_comment: ASSET_CATALOG,
        };
        objects['PBXBuildFile'][`${buildFileId}_comment`] = `${ASSET_CATALOG} in Resources`;
      }

      // Resources build phase
      const phaseId = 'WIDGETASSETS000003';
      objects['PBXResourcesBuildPhase'] = objects['PBXResourcesBuildPhase'] || {};
      if (!objects['PBXResourcesBuildPhase'][phaseId]) {
        objects['PBXResourcesBuildPhase'][phaseId] = {
          isa: 'PBXResourcesBuildPhase',
          buildActionMask: 2147483647,
          files: [{ value: buildFileId, comment: `${ASSET_CATALOG} in Resources` }],
          runOnlyForDeploymentPostprocessing: 0,
        };
        objects['PBXResourcesBuildPhase'][`${phaseId}_comment`] = 'Resources';
      }

      // Add phase to target
      if (!widgetTarget.buildPhases.some((bp) => bp.value === phaseId)) {
        widgetTarget.buildPhases.push({ value: phaseId, comment: 'Resources' });
      }

      console.log(`[widget-assets] injected ${ASSET_CATALOG} into ${WIDGET_TARGET_NAME}`);
      return originalWriteSync();
    };

    return mod;
  });
};
