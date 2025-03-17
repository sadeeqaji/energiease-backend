import { env } from "@/config";
import appInsights from "applicationinsights";

appInsights
    .setup(env.APPINSIGHTS_INSTRUMENTATION_KEY)
    .setAutoDependencyCorrelation(true)
    .setAutoCollectRequests(true)
    .setAutoCollectPerformance(true, true)
    .setAutoCollectExceptions(true)
    .setAutoCollectDependencies(true)
    .start();

export const telemetryClient = appInsights.defaultClient;