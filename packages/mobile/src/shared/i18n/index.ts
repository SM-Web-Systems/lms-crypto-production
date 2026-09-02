import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import * as Localization from "expo-localization";

import en from "./locales/en.json";
import fr from "./locales/fr.json";
import es from "./locales/es.json";
import pt from "./locales/pt.json";
import ar from "./locales/ar.json";
import zh from "./locales/zh.json";
import sw from "./locales/sw.json";
import af from "./locales/af.json";
import zu from "./locales/zu.json";
import xh from "./locales/xh.json";
import st from "./locales/st.json";
import tn from "./locales/tn.json";
import nso from "./locales/nso.json";
import nr from "./locales/nr.json";
import sn from "./locales/sn.json";
import ss from "./locales/ss.json";
import ts from "./locales/ts.json";
import ve from "./locales/ve.json";

const deviceLang = Localization.getLocales()?.[0]?.languageCode || "en";
const supportedCodes = [
  "en","fr","es","pt","ar","zh","sw","af",
  "zu","xh","st","tn","nso","nr","sn","ss","ts","ve",
];
const defaultLng = supportedCodes.includes(deviceLang) ? deviceLang : "en";

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    fr: { translation: fr },
    es: { translation: es },
    pt: { translation: pt },
    ar: { translation: ar },
    zh: { translation: zh },
    sw: { translation: sw },
    af: { translation: af },
    zu: { translation: zu },
    xh: { translation: xh },
    st: { translation: st },
    tn: { translation: tn },
    nso: { translation: nso },
    nr: { translation: nr },
    sn: { translation: sn },
    ss: { translation: ss },
    ts: { translation: ts },
    ve: { translation: ve },
  },
  lng: defaultLng,
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

export default i18n;
