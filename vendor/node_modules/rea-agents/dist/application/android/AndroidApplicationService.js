import { androidApplicationProjectionInputSchema, projectAndroidApplication, } from "../../domain/android/androidApplication.js";
import { ANDROID_APPLICATION_PROVIDER } from "../InvestigationProviders.js";
import { projectInventoryEvidence } from "../InventoryProjectionEvidence.js";
const OPERATION = "project_android_application_graph";
/** Project authenticated APK inventory Evidence into Android application Evidence. */
export const projectAndroidApplicationEvidence = (rawInput) => {
    return projectInventoryEvidence({
        rawInput,
        schema: androidApplicationProjectionInputSchema,
        project: projectAndroidApplication,
        operation: OPERATION,
        predicateType: "rea.android-application-graph",
        provider: ANDROID_APPLICATION_PROVIDER,
        subjectFormat: () => "apk",
        protocolError: "Android application projection produced an invalid result",
    });
};
