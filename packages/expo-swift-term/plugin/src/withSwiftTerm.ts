import {
  ConfigPlugin,
  withXcodeProject,
} from "@expo/config-plugins";

const SWIFTTERM_REPO = "https://github.com/migueldeicaza/SwiftTerm.git";
const SWIFTTERM_VERSION = "1.0.0"; // minimum version, uses "Up to Next Major"

const withSwiftTerm: ConfigPlugin = (config) => {
  return withXcodeProject(config, (config) => {
    const project = config.modResults;
    const rootUuid = project.getFirstProject().uuid;
    const rootObject = project.hash.project.objects.PBXProject[rootUuid];

    // Add Swift Package reference if not already present
    if (!rootObject.packageReferences) {
      rootObject.packageReferences = [];
    }

    const alreadyAdded = rootObject.packageReferences.some(
      (ref: { comment?: string }) =>
        ref.comment?.includes("SwiftTerm")
    );

    if (!alreadyAdded) {
      // Create XCRemoteSwiftPackageReference
      const pkgRefUuid = project.generateUuid();
      project.hash.project.objects.XCRemoteSwiftPackageReference =
        project.hash.project.objects.XCRemoteSwiftPackageReference || {};
      project.hash.project.objects.XCRemoteSwiftPackageReference[pkgRefUuid] = {
        isa: "XCRemoteSwiftPackageReference",
        repositoryURL: SWIFTTERM_REPO,
        requirement: {
          kind: "upToNextMajorVersion",
          minimumVersion: SWIFTTERM_VERSION,
        },
      };
      project.hash.project.objects.XCRemoteSwiftPackageReference[
        `${pkgRefUuid}_comment`
      ] = "SwiftTerm";

      rootObject.packageReferences.push({
        value: pkgRefUuid,
        comment: "SwiftTerm",
      });

      // Create XCSwiftPackageProductDependency for the main target
      const nativeTargets =
        project.hash.project.objects.PBXNativeTarget;
      const targetKeys = Object.keys(nativeTargets).filter(
        (k) => !k.endsWith("_comment")
      );

      // Find the main app target (not tests, not widgets)
      const appTargetKey = targetKeys.find((k) => {
        const target = nativeTargets[k];
        return (
          target.productType === '"com.apple.product-type.application"'
        );
      });

      if (appTargetKey) {
        const appTarget = nativeTargets[appTargetKey];
        const depUuid = project.generateUuid();

        project.hash.project.objects.XCSwiftPackageProductDependency =
          project.hash.project.objects
            .XCSwiftPackageProductDependency || {};
        project.hash.project.objects.XCSwiftPackageProductDependency[
          depUuid
        ] = {
          isa: "XCSwiftPackageProductDependency",
          package: pkgRefUuid,
          productName: "SwiftTerm",
        };
        project.hash.project.objects.XCSwiftPackageProductDependency[
          `${depUuid}_comment`
        ] = "SwiftTerm";

        if (!appTarget.packageProductDependencies) {
          appTarget.packageProductDependencies = [];
        }
        appTarget.packageProductDependencies.push({
          value: depUuid,
          comment: "SwiftTerm",
        });
      }
    }

    return config;
  });
};

export default withSwiftTerm;
