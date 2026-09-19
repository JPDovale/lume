/** Compatibility facade. Forecasting policies and estimators live in the shared domain module. */
export { forecastSeries as adaptiveForecast } from "../forecasting/series";
export { methodNames, type ForecastMethod } from "../forecasting/models";
