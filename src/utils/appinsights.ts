import { env } from "@/config";
import appInsights from "applicationinsights";

appInsights
    .setup(env.APPLICATIONINSIGHTS_CONNECTION_STRING)
    .setAutoDependencyCorrelation(true)
    .setAutoCollectRequests(true)
    .setAutoCollectPerformance(true, true)
    .setAutoCollectExceptions(true)
    .setAutoCollectDependencies(true)
    .start();

export const telemetryClient = appInsights.defaultClient;