import { whatsappPhoneDigits } from './normalize-whatsapp-phone.util';

const NATIONAL_SIGNIFICANT_LENGTH = 10;

/** Match stored list phones to inbound OpenWA ids when country codes differ. */
export function whatsappPhonesMatchForReply(
  storedPhone: string,
  inboundDigits: string,
): boolean {
  const storedDigits = whatsappPhoneDigits(storedPhone);
  if (!storedDigits || !inboundDigits) {
    return false;
  }

  if (storedDigits === inboundDigits) {
    return true;
  }

  if (
    storedDigits.length >= NATIONAL_SIGNIFICANT_LENGTH &&
    inboundDigits.length >= NATIONAL_SIGNIFICANT_LENGTH
  ) {
    return (
      storedDigits.slice(-NATIONAL_SIGNIFICANT_LENGTH) ===
      inboundDigits.slice(-NATIONAL_SIGNIFICANT_LENGTH)
    );
  }

  return (
    storedDigits.endsWith(inboundDigits) || inboundDigits.endsWith(storedDigits)
  );
}
