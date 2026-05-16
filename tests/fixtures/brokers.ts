import { BrokerSchema, type Broker } from "../../src/types/broker.js";

function makeBroker(input: Partial<Broker> & Pick<Broker, "id" | "name" | "domain" | "region" | "category" | "removal_method">): Broker {
  return BrokerSchema.parse(input);
}

export const emailBasicBroker: Broker = makeBroker({
  id: "email-basic",
  name: "Email Basic Broker",
  domain: "email-basic.example.invalid",
  region: "us",
  category: "people-search",
  removal_method: "email",
  email: "privacy@email-basic.example.invalid",
});

export const emailConfirmBroker: Broker = makeBroker({
  id: "email-confirm",
  name: "Email Confirm Broker",
  domain: "email-confirm.example.invalid",
  region: "us",
  category: "people-search",
  removal_method: "email",
  email: "privacy@email-confirm.example.invalid",
  requires_email_confirm: true,
});

export const hybridBasicBroker: Broker = makeBroker({
  id: "hybrid-basic",
  name: "Hybrid Basic Broker",
  domain: "hybrid-basic.example.invalid",
  region: "us",
  category: "people-search",
  removal_method: "hybrid",
  email: "privacy@hybrid-basic.example.invalid",
  opt_out_url: "https://hybrid-basic.example.invalid/opt-out",
});

export const webManualBroker: Broker = makeBroker({
  id: "web-manual",
  name: "Web Manual Broker",
  domain: "web-manual.example.invalid",
  region: "us",
  category: "people-search",
  removal_method: "web_form",
  opt_out_url: "https://web-manual.example.invalid/opt-out",
});

export const captchaWebBroker: Broker = makeBroker({
  id: "captcha-web",
  name: "Captcha Web Broker",
  domain: "captcha-web.example.invalid",
  region: "us",
  category: "people-search",
  removal_method: "web_form",
  opt_out_url: "https://captcha-web.example.invalid/opt-out",
  requires_captcha: true,
});

export const testBrokers: readonly Broker[] = [
  emailBasicBroker,
  emailConfirmBroker,
  hybridBasicBroker,
  webManualBroker,
  captchaWebBroker,
];
