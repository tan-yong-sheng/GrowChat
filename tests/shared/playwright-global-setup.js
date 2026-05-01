import { preparePlaywrightAuthStorageStateFile } from "./test-env.js";

export default async function globalSetup() {
	await preparePlaywrightAuthStorageStateFile();
}
