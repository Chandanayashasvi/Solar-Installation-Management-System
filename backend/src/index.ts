import { buildApp } from "./app";
import { config } from "./config";
buildApp().listen(config.PORT, () => console.log(`API listening on :${config.PORT}`));
