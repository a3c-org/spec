import { contactSuite, labelSuite } from "./conformance.ts";
import { rowsDriver } from "./driver.ts";
contactSuite(rowsDriver);
labelSuite(rowsDriver);
