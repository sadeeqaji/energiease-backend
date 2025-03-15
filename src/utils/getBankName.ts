import { banks } from '@/constants/banks';

let bankMap: Map<string, string> | null = null;

async function initializeBankMap() {
  if (!bankMap) {
    bankMap = new Map(banks.map((bank) => [bank.id, bank.title]));
  }
}

export async function getBankName(
  bankCode: string,
): Promise<string | undefined> {
  await initializeBankMap();
  return bankMap?.get(bankCode);
}
