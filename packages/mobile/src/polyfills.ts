import "react-native-url-polyfill/auto";
import "react-native-get-random-values";
import { Buffer } from "buffer";

global.Buffer = global.Buffer || Buffer;

// Polyfill TextEncoder/TextDecoder
if (typeof global.TextEncoder === "undefined") {
  const { TextEncoder, TextDecoder } = require("text-encoding");
  global.TextEncoder = TextEncoder;
  global.TextDecoder = TextDecoder;
}

// Polyfill process.env
if (typeof process === "undefined") {
  (global as any).process = { env: {} };
} else if (!process.env) {
  process.env = {} as any;
}
