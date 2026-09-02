import phone from "phone";

export interface PhoneValidationResult {
  isValid: boolean;
  phoneNumber: string; // normalized E.164
  countryCode: string; // ISO 3166 alpha-3
}

/**
 * Validate and normalize a phone number to E.164 format.
 * Returns the normalized number and country code.
 */
export function validatePhoneNumber(input: string): PhoneValidationResult {
  const result = phone(input);

  if (!result.isValid) {
    return { isValid: false, phoneNumber: input, countryCode: "" };
  }

  return {
    isValid: true,
    phoneNumber: result.phoneNumber, // e.g. "+14155552671"
    countryCode: result.countryIso3,  // e.g. "USA"
  };
}
