export {};

// Global buat script client Midtrans (dimuat lewat <Script> di RequestForm/
// PayOrderButton). getCardToken: tokenisasi kartu sebelum submit ke server
// kita (nomor kartu tidak pernah menyentuh server kita). authenticate:
// challenge 3DS — popup kecil, bukan redirect halaman penuh.
declare global {
  interface Window {
    MidtransNew3ds?: {
      getCardToken: (
        card: {
          card_number: string;
          card_exp_month: string;
          card_exp_year: string;
          card_cvv: string;
        },
        callbacks: {
          onSuccess: (res: { token_id: string }) => void;
          onFailure: (err: unknown) => void;
        },
      ) => void;
      authenticate: (
        redirectUrl: string,
        options: {
          performAuthentication?: boolean;
          onSuccess?: () => void;
          onPending?: () => void;
          onFailure?: () => void;
        },
      ) => void;
    };
  }
}
