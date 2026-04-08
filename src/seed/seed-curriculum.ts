import { QuestionType } from '../common/enums/question-type.enum';
import type { TheorySlide } from '../common/types/theory-slide';

export type QSeed = {
  prompt: string;
  type: QuestionType;
  options: { text: string; correct: boolean; match?: string }[];
};

export type LessonSeed = {
  title: string;
  parentContent: string;
  nazariya: string;
  /** Seed.service: asosan LESSON_SLIDES[lessonKey] ishlatiladi */
  slides?: TheorySlide[];
  mashq: QSeed[];
};

export type ModuleSeed = {
  title: string;
  lessons: LessonSeed[];
};

const SC = QuestionType.SINGLE_CHOICE;
const YN = QuestionType.YES_NO;
const MA = QuestionType.MATCHING;

const INTRO =
  "ElektroLearn — Elektr xavfsizligi bo'yicha o'quv kursi (Duolingo uslubi). Avval «Nazariya»ni o'qing, keyin «Mashq»ni bajaring.";

export const MODULE_SEED_DATA: ModuleSeed[] = [
  {
    title: '1-Modul: Shaxsiy xavfsizlik',
    lessons: [
      {
        title: '1.1-dars: Shaxsiy himoya vositalari (SHHV) va ularni tanlash',
        parentContent: INTRO,
        nazariya: `Ushbu darsda xodim har bir uskunaning vazifasini va ularsiz ishga kirishishning oqibatlarini o'rganadi.

1. Shaxsiy himoya vositalari nima uchun kerak?

Elektr qurilmalarida ishlayotganda xodimni uchta asosiy xavfdan himoya qilish kerak:
• Elektr toki urishi (bevosita tegish yoki yoy orqali)
• Elektr yoyi (termik ta'sir — juda yuqori harorat)
• Mexanik shikastlanishlar (balandlikdan tushish, boshga narsa tushishi)

2. Asosiy SHHV ro'yxati va texnik talablar

Vosita nomi — Vazifasi va xususiyati — Tekshirish usuli
Himoya kaskasi — Boshni mexanik zarba va tokdan himoya qiladi — Ichki tasmalarining mustahkamligi va yorilishlar yo'qligi
Dielektrik qo'lqop — 1000 V gacha asosiy, 1000 V dan yuqori qo'shimcha himoya — Havo haydash: qo'lqopni o'rab, havo chiqmayotganiga ishonch
Maxsus kiyim (Kombinezon) — Faqat paxtali (X/B), elektr yoyiga chidamli — Yenglar tugmalangan, shim poyabzal ustidan
Himoya ko'zoynagi — Elektr yoyi chaqnashidan ko'zni asraydi — Chizilmagan va tiniq
Dielektrik botinka/gilamcha — "Qadam kuchlanishi"dan saqlaydi — Teshiklar va namlik yo'qligi

Muhim: Dielektrik qo'lqoplarning sinov muddati — 6 oyda bir marta. Shtamp bo'lmasa yoki muddati o'tgan bo'lsa — foydalanish xavfli!`,
        mashq: [
          {
            prompt: "110 kVli podstansiyada ishlash uchun qaysi qo'lqop mos keladi?",
            type: SC,
            options: [
              { text: "Oddiy qurilish qo'lqopi", correct: false },
              { text: "Rezina xo'jalik qo'lqopi", correct: false },
              { text: '"EN" belgisi tushirilgan dielektrik qo\'lqop', correct: true },
            ],
          },
          {
            prompt: "Dielektrik qo'lqopda igna kabi teshik topsangiz nima qilasiz?",
            type: SC,
            options: [
              { text: 'Izolyatsiya tasmasi bilan yopishtiraman', correct: false },
              { text: "Teshik kichkina, xavf yo'q", correct: false },
              { text: "Foydalanishni darhol to'xtataman va yaroqsizga chiqaraman", correct: true },
            ],
          },
          {
            prompt: 'Sintetik (neylon, poliester) kiyimda podstansiyaga kirish taqiqlanadi',
            type: YN,
            options: [
              { text: 'Ha', correct: true },
              { text: "Yo'q", correct: false },
            ],
          },
        ],
      },
      {
        title: "1.2-dars: Himoya vositalarini sinovdan o'tkazish muddatlari va me'yorlari",
        parentContent: INTRO,
        nazariya: `Bu darsda har bir uskuna qachon laboratoriyaga topshirilishini va ishlatishdan oldin nimalarga qarashni o'rganasiz.

1. Elektr xavfsizligi vositalari tasnifi
• Asosiy himoya vositalari: izolyatsiyasi ishchi kuchlanishga uzoq vaqt bardosh beradi (operativ shtangalar, kuchlanish ko'rsatkichlari).
• Qo'shimcha himoya vositalari: asosiy vositaga qo'shimcha; yakka o'zi to'liq tokdan himoya qilmaydi (dielektrik botinkalar, gilamchalar).

2. Sinov muddatlari jadvali
Dielektrik qo'lqoplar — 6 oyda 1 marta — suvli vannada yuqori kuchlanish
Operativ shtangalar — 24 oyda 1 marta — elektr mustahkamlik
Kuchlanish ko'rsatkichlari — 12 oyda 1 marta — ishga tushish kuchlanishi
Izolyatsiyalovchi qisqichlar — 24 oyda 1 marta — izolyatsiya qatlami
Dielektrik botinkalar — 36 oyda 1 marta — elektr sinovi

Ekspert: Agar vosita yerga tushgan, shikastlangan yoki nam bo'lsa — muddati tugamagan bo'lsa ham navbatdan tashqari sinov shart!`,
        mashq: [
          {
            prompt: "Qaysi qo'lqopning sinov muddati o'tgan? A: sinov 2025 yanvar (bugun 2026 mart). B: sinov 2025 noyabr. C: shtampsiz.",
            type: SC,
            options: [
              { text: 'Faqat A', correct: false },
              { text: 'A va C', correct: true },
              { text: 'Faqat B', correct: false },
            ],
          },
          {
            prompt: 'Sinov muddatlarini moslang',
            type: MA,
            options: [
              { text: "Qo'lqop", correct: true, match: '6 oy' },
              { text: 'Indikator', correct: true, match: '12 oy' },
              { text: 'Shtanga', correct: true, match: '24 oy' },
              { text: 'Botinka', correct: true, match: '36 oy' },
            ],
          },
          {
            prompt: "Dielektrik gilamchalar har 6 oyda laboratoriya sinovidan o'tkazilishi shart",
            type: YN,
            options: [
              { text: 'Ha', correct: false },
              { text: "Yo'q", correct: true },
            ],
          },
          {
            prompt: 'Himoya vositasi yerga tushib ketsa, sinov muddati tugamagan bo\'lsa ham navbatdan tashqari sinov shart',
            type: YN,
            options: [
              { text: 'Ha', correct: true },
              { text: "Yo'q", correct: false },
            ],
          },
        ],
      },
      {
        title: '1.3-dars: Xavfsizlik plakatlari va belgilari (Signallar tili)',
        parentContent: INTRO,
        nazariya: `MET tizimida plakatlar 4 ta asosiy guruhga bo'linadi.

Guruh — Rangi — Ma'nosi — Misol
Taqiqlovchi — Qizil/Oq — Amallarni taqiqlaydi — YOQMANG! Odamlar ishlayapti
Ogohlantiruvchi — Sariq/Qora — Xavf haqida ogohlantiradi — TO'XTANG! Kuchlanish
Buyuruvchi — Ko'k/Oq — Ruxsat etilgan joy — SHU YERDA ISHLANG
Ko'rsatuvchi — Yashil/Oq — Xavfsiz holat — YERLATILGAN

Oltin qoidalar: vaqtinchalik plakatlar faqat ish vaqtida; ko'rinish balandligi qulay; metall PS da plakatlar dielektrik materialdan.

Eng muhim: "YOQMANG! Odamlar ishlayapti" ilingan klyuchni hech kim (hatto bosh muhandis) burashga haqli emas — faqat ilgan xodim oladi.`,
        mashq: [
          {
            prompt: "220 kVli ajratgich ochildi. Qaysi plakat ilinadi?",
            type: SC,
            options: [
              { text: "'Shu yerga chiqing'", correct: false },
              { text: 'YOQMANG! Odamlar ishlayapti', correct: true },
              { text: 'YERLATILGAN', correct: false },
            ],
          },
          {
            prompt: 'Ish joyi tayyorlandi. Ishchi qayerda ishlashini qanday biladi?',
            type: SC,
            options: [
              { text: "Ogohlantiruvchi sariq plakat orqali", correct: false },
              { text: "'SHU YERDA ISHLANG' (Ko'k/Oq — Buyuruvchi)", correct: true },
              { text: 'Yashil YERLATILGAN orqali', correct: false },
            ],
          },
          {
            prompt: 'Plakat ranglarini moslang',
            type: MA,
            options: [
              { text: 'Qizil plakat', correct: true, match: 'Taqiqlash' },
              { text: 'Sariq plakat', correct: true, match: 'Ogohlantirish' },
              { text: "Ko'k plakat", correct: true, match: 'Ruxsat etilgan nuqta' },
              { text: 'Yashil plakat', correct: true, match: 'Xavfsiz holat' },
            ],
          },
        ],
      },
    ],
  },
  {
    title: '2-Modul: Podstansiya hududidagi tartib-qoidalar',
    lessons: [
      {
        title: "2.1-dars: Naryad-ruxsatnoma va Farmoyish (Hujjatlar bilan ishlash)",
        parentContent: INTRO,
        nazariya: `Elektr qurilmalarida ish oldidan rasmiy ruxsat majburiy.

Ishlarni tashkil etish: Naryad-ruxsatnoma (murakkab, uzoq ishlar), Farmoyish (oddiy, qisqa), Joriy ekspluatatsiya (ro'yxatdagi mayda ishlar).

Naryadning 7 ta elementi: ish joyi; vaqt; ishga ruxsat beruvchi; ish rahbari; brigada; xavfsizlik tadbirlari; imzolar.

Naryad: amal muddati 15 kalendar kuni; uzaytirish faqat 1 marta (+15 kun); yopish; saqlash 30 kun. Ikki nusxada. Naryad yo'qolsa — ishni to'xtatib yangisi.`,
        mashq: [
          {
            prompt: "110 kV kabelni almashtirasiz — uch kunlik ish. Qaysi hujjat?",
            type: SC,
            options: [
              { text: 'Farmoyish', correct: false },
              { text: 'Naryad-ruxsatnoma', correct: true },
              { text: "Og'zaki ruxsat", correct: false },
            ],
          },
          {
            prompt: "Naryad-ruxsatnomasining amal qilish muddati necha kalendar kuni?",
            type: SC,
            options: [
              { text: '7 kun', correct: false },
              { text: '15 kun', correct: true },
              { text: '30 kun', correct: false },
            ],
          },
          {
            prompt: 'Naryad muddatini ikki marta uzaytirish mumkin',
            type: YN,
            options: [
              { text: 'Ha', correct: false },
              { text: "Yo'q", correct: true },
            ],
          },
          {
            prompt: 'Kim naryad berishga vakolatli?',
            type: SC,
            options: [
              { text: 'Ixtiyoriy navbatchi', correct: false },
              { text: "Belgilanigan vakolatli shaxs (mas'ul muhandis)", correct: true },
              { text: 'Faqat dispetcher', correct: false },
            ],
          },
        ],
      },
      {
        title: '2.2-dars: Kuchlanish ostidagi qismlargacha xavfsiz masofalar',
        parentContent: INTRO,
        nazariya: `Tok urishi uchun simga tegish shart emas. Kuchlanish baland — havo orqali yoy masofasi katta.

Minimal masofalar (xodim va asbob): 1 kV gacha 0,3 m / 0,6 m; 1–35 kV 0,6/0,6 m; 110 kV 1,0 m; 220 kV 2,0 m; 500 kV 3,5 m; 750 kV 5,0 m.

Qadam kuchlanishi: yer bo'ylab tok — xavfli radius simdan ~8 m; kichik qadam yoki bir oyoq usuli.

220 kV da hatto 2 m masofada uzun metall asbob ko'tarish xavfli — yoy jalb qilishi mumkin.`,
        mashq: [
          {
            prompt: '220 kV shinoprovod. 1,5 m masofada holat?',
            type: SC,
            options: [
              { text: 'Xavfsiz', correct: false },
              { text: 'XAVF (minimal 2 m)', correct: true },
            ],
          },
          {
            prompt: 'Kuchlanish va masofani moslang',
            type: MA,
            options: [
              { text: '110 kV', correct: true, match: '1,0 m' },
              { text: '220 kV', correct: true, match: '2,0 m' },
              { text: '35 kV', correct: true, match: '0,6 m' },
              { text: '500 kV', correct: true, match: '3,5 m' },
            ],
          },
          {
            prompt: "Yerga 35 kV sim tushib yotibdi. Necha metrdan yaqin bormaysiz?",
            type: SC,
            options: [
              { text: '1 m', correct: false },
              { text: '3 m', correct: false },
              { text: '8 m', correct: true },
              { text: '5 m', correct: false },
            ],
          },
          {
            prompt: 'Yerga tushgan sim atrofida xavf faqat tegishdan iborat',
            type: YN,
            options: [
              { text: 'Ha', correct: false },
              { text: "Yo'q", correct: true },
            ],
          },
        ],
      },
      {
        title: '2.3-dars: Podstansiya hududida harakatlanish qoidalari',
        parentContent: INTRO,
        nazariya: `Zonalar: Erkin (ma'muriy) — barcha; Nazorat ostidagi — EXG li xodimlar; Cheklangan — faqat ruxsatli brigada.

Qoidalar: yo'laklar bo'ylab; shkaflar yopiq; yolg'iz kirish II dan past uchun taqiqlanadi; yugurish taqiqlanadi.

Avariyalar ko'pincha ruxsatsiz yolg'on kirishda. "Men avval ko'rib kelaman" — xavfli fikr.`,
        mashq: [
          {
            prompt: "II guruh. Yolg'iz 110 kV ORU ga kirish mumkinmi?",
            type: YN,
            options: [
              { text: 'Ha', correct: false },
              { text: "Yo'q", correct: true },
            ],
          },
          {
            prompt: "To'g'ri tartibni tanlang",
            type: SC,
            options: [
              { text: "SHHV → topshiriq → naryad", correct: false },
              {
                text: "Topshiriq → naryadni o'qib imzolash → SHHV → navbatchi bilan",
                correct: true,
              },
              { text: 'Navbatchi → topshiriq → SHHV', correct: false },
            ],
          },
        ],
      },
    ],
  },
  {
    title: '3-Modul: Texnik tadbirlar (Ish joyini tayyorlash)',
    lessons: [
      {
        title: "3.1-dars: Kuchlanishni o'chirish (1-chi oltin qoida)",
        parentContent: INTRO,
        nazariya: `Algoritm: Yukni kamaytirish → Ajratgich o'chirish → Razedinitelni ochish → Blokirovka.

XATO: avval razedinitel, keyin ajratgich — yuk ostida razedinitel ochilmaydi.

Blokirovka: masofadan boshqarish klyuchini oling; shaxsiy qulf; "YOQMANG!" plakati.

Barcha tomonlardan o'chirish: asosiy liniya, zaxira, transformator ikkilamchi teskari kuchlanish.`,
        mashq: [
          {
            prompt: "Kuchlanishni o'chirish tartibi",
            type: SC,
            options: [
              { text: "Razedinitel → ajratgich → blokirovka", correct: false },
              {
                text: 'Yukni kamaytirish → ajratgich → razedinitel → blokirovka',
                correct: true,
              },
              { text: 'Blokirovka → ajratgich', correct: false },
            ],
          },
          {
            prompt: 'Jasur razedinitelni ochmoqchi, ajratgich hali yoniq. Nima qilsin?',
            type: SC,
            options: [
              { text: "Darhol razedinitelni ochsin", correct: false },
              { text: 'Avval ajratgichni o\'chirishi kerak', correct: true },
              { text: 'Dispetcherni so\'rasin', correct: false },
            ],
          },
          {
            prompt: "Faqat bitta ajratgichni o'chirish kifoya",
            type: YN,
            options: [
              { text: 'Ha', correct: false },
              { text: "Yo'q", correct: true },
            ],
          },
        ],
      },
      {
        title: "3.2-dars: Kuchlanish yo'qligini tekshirish (2-chi oltin qoida)",
        parentContent: INTRO,
        nazariya: `Tekshirish: ko'rsatkichni avval tok bor simda sinash → A,B,C fazalar → keyin yana tok bor simda sinash (batareya/yoniq tekshiruvi).

UVN-90: 1 kV gacha, neon. UVNF: 6–110 kV, tovush+yorug'lik. UVN-10: 6–10 kV kontakt. Kontaktsiz: keng diapazon, elektromagnit maydon.

Muhim: ko'rsatkich nosoz bo'lishi mumkin — oldin va keyin sinash hayot-xavfsizlik masalasi.`,
        mashq: [
          {
            prompt: "Kuchlanish yo'qligini tekshirishda birinchi qadam?",
            type: SC,
            options: [
              { text: 'Darhol fazalarni tekshirish', correct: false },
              { text: "Ko'rsatkichni tok bor simda sinash", correct: true },
              { text: "Darhol yerlatgich", correct: false },
            ],
          },
          {
            prompt: "10 kV kabelda fazalar signal bermadi. Keyingi qadam?",
            type: SC,
            options: [
              { text: "Darhol yerlatgich o'rnataman", correct: false },
              {
                text: "Ko'rsatkichni yana tok bor simda sinab, keyin yerlatgich",
                correct: true,
              },
              { text: 'Ishni tugataman', correct: false },
            ],
          },
          {
            prompt: "Tekshirishdan oldin va keyin ko'rsatkichni sinash shart",
            type: YN,
            options: [
              { text: 'Ha', correct: true },
              { text: "Yo'q", correct: false },
            ],
          },
        ],
      },
      {
        title: "3.3-dars: Yerlatish (Zazemleniye) o'rnatish (3-chi oltin qoida)",
        parentContent: INTRO,
        nazariya: `O'rnatish: ER → A → B → C (avval yer). Yechish: C → B → A → ER (avval faza).

Ketma-ketlik buzilsa va kuchlanish qaytsa — xavf. Ko'chma yerlatgich mis kesimi kamida 25 mm².

Qayerda: ish joyi ikkala tomoni; uzun kabelda har 200 m; ko'rinmas joylarda ham.`,
        mashq: [
          {
            prompt: "O'rnatish tartibi (Drag&Drop mantiqiy)",
            type: MA,
            options: [
              { text: '1-qadam', correct: true, match: 'ER shinasiga' },
              { text: '2-qadam', correct: true, match: 'Faza A' },
              { text: '3-qadam', correct: true, match: 'Faza B' },
              { text: '4-qadam', correct: true, match: 'Faza C' },
            ],
          },
          {
            prompt: 'Rustam avval A fazasini, keyin ER ni uladi. Bu nima uchun xavfli?',
            type: SC,
            options: [
              { text: "Hech qanday xavf yo'q", correct: false },
              { text: 'Kuchlanish kelsa qisqa tutashuv orqali tok oqimi xavfi', correct: true },
              { text: 'Faqat tartib buzilgan', correct: false },
            ],
          },
          {
            prompt: 'Yechish tartibi',
            type: SC,
            options: [
              { text: 'ER → C → B → A', correct: false },
              { text: 'C → B → A → ER', correct: true },
              { text: 'A → B → C → ER', correct: false },
            ],
          },
        ],
      },
      {
        title: "3.4-dars: Qo'riqlovchi to'siqlar o'rnatish (4-chi oltin qoida)",
        parentContent: INTRO,
        nazariya: `To'siq: izolyatsiyalangan (yaqin ish); saqlash arqon-lentasi (zona chegarasi); ko'chma panel (hajmli zona).

To'siqni faqat ishga ruxsat beruvchi o'zgartiradi. Xodim o'zi siljitsa — naryad bekor.`,
        mashq: [
          {
            prompt: "35 kVda ish bor, yonidagi 110 kV shin tok ostida. Nima kerak?",
            type: SC,
            options: [
              { text: "Hech narsa", correct: false },
              { text: "110 kV yoniga ogohlantiruvchi to'siq", correct: true },
              { text: 'Ishni bekor qilish', correct: false },
            ],
          },
          {
            prompt: "To'siqni xodim vaqtincha ko'chirib keyin qaytarishi mumkin",
            type: YN,
            options: [
              { text: 'Ha', correct: false },
              { text: "Yo'q", correct: true },
            ],
          },
        ],
      },
      {
        title: "3.5-dars: Plakat va belgilar ilish (5-chi oltin qoida)",
        parentContent: INTRO,
        nazariya: `Klyuchda: YOQMANG! (Taqiqlovchi). Kuchlanish yonida: TO'XTANG! Ish joyida: SHU YERDA ISHLANG. Yerlatgich: YERLATILGAN.

Plakat ilingan qurilmada telefon buyrug'i ham kuchlanish bermaydi — faqat ruxsat beruvchi plakat bilan.`,
        mashq: [
          {
            prompt: 'Plakatlarni joyga moslang',
            type: MA,
            options: [
              { text: 'Klyuchda', correct: true, match: 'YOQMANG!' },
              { text: 'Kuchlanish yonida', correct: true, match: "TO'XTANG!" },
              { text: 'Ish joyida', correct: true, match: 'SHU YERDA ISHLANG' },
              { text: 'Yerlatgich yonida', correct: true, match: 'YERLATILGAN' },
            ],
          },
          {
            prompt:
              "Dispetcher plakatni olishni buyursa — 'plakat ilingan, faqat ishga ruxsat beruvchi olishi mumkin' deb rad etish kerak",
            type: YN,
            options: [
              { text: 'Ha', correct: true },
              { text: "Yo'q", correct: false },
            ],
          },
        ],
      },
    ],
  },
  {
    title: '4-Modul: Favqulodda vaziyatlar va maxsus ishlar',
    lessons: [
      {
        title: "4.1-dars: Elektr toki urishida birinchi yordam",
        parentContent: INTRO,
        nazariya: `Yalang'och qo'l bilan tegmang — tok o'tishi mumkin.

Ajratish: klyuch yaqin bo'lsa o'chirish; uzoqda — quruq yog'och/plastik; tayoq yo'q — quruq kiyimdan tortish; balandda — avval tokni o'chirish.

Algoritm: tokdan ajratish → xavfsiz joy → hush → nafas → 103/112 → YOR.

YOR: ko'krak siqish 30 (5–6 sm, 100–120/min) + 2 nafas; nisbat 30:2.`,
        mashq: [
          {
            prompt: 'Birinchi yordam tartibi',
            type: SC,
            options: [
              { text: 'YOR → 112 → ajratish', correct: false },
              { text: 'Ajratish → hush → nafas → 112 → YOR', correct: true },
              { text: '112 → ajratish', correct: false },
            ],
          },
          {
            prompt: 'YOR nisbati',
            type: SC,
            options: [
              { text: '15:1', correct: false },
              { text: '30:2', correct: true },
              { text: '20:3', correct: false },
            ],
          },
          {
            prompt: "Tok urayotgan odamni qo'lidan ushlab tortish xavfli (tok sizga ham o'tishi mumkin)",
            type: YN,
            options: [
              { text: 'Ha', correct: true },
              { text: "Yo'q", correct: false },
            ],
          },
          {
            prompt: 'Jabrlanuvchi hushida, nafas olmoqda, kuygan joylari bor. Nima qilasiz?',
            type: SC,
            options: [
              { text: 'Darhol ko\'tarib olaman', correct: false },
              { text: 'Tezkor yordam, harakatlantirmasdan', correct: true },
              { text: 'Suv quyaman', correct: false },
            ],
          },
        ],
      },
      {
        title: '4.2-dars: Balandlikda ishlash xavfsizligi',
        parentContent: INTRO,
        nazariya: `1,8 m va undan yuqori — balandlikda ishlash.

Kamar 6 oyda sinov; narvon 75°; lesa har 2 m to'siq; karabin har safar.

Kamar: lanyard mustahkam konstruksiyaga; mahkamlanish beldan yuqorida.

Taqiq: kamarsiz, yolg'iz, momaqaldiroq, muzlagan narvon, <10 m ko'rinishda tumanda.`,
        mashq: [
          {
            prompt: 'Narvon burchagi 60° — ishlash mumkin',
            type: YN,
            options: [
              { text: 'Ha', correct: false },
              { text: "Yo'q (70–75°)", correct: true },
            ],
          },
          {
            prompt: 'Karabin beldan past mahkamlangan — bu xato?',
            type: YN,
            options: [
              { text: 'Ha', correct: true },
              { text: "Yo'q", correct: false },
            ],
          },
          {
            prompt: '6 m balandlikda mahkamlanish joyi yo‘q. Nima qilasiz?',
            type: SC,
            options: [
              { text: 'Baribir chiqaman', correct: false },
              { text: 'Ish rahbariga murojaat, joy topilgunicha to\'xtatish', correct: true },
              { text: 'Kamarsiz ishlash', correct: false },
            ],
          },
          {
            prompt: 'Balandlikda ishlash qayerdan boshlanadi?',
            type: SC,
            options: [
              { text: '1,0 m', correct: false },
              { text: '1,8 m', correct: true },
              { text: '2,0 m', correct: false },
            ],
          },
        ],
      },
      {
        title: "4.3-dars: Elektr qurilmalarida yong'inni o'chirish",
        parentContent: INTRO,
        nazariya: `Tok ostida SUV BILAN o'chirish TA'QIQLANADI.

OV/OP — taqiqlangan. Kukun ~1 kV. CO₂ (OU) ~10 kV. Aerozol — yuqori kuchlanish.

Kuchlanish ostida yong'in: masofaga chekinish → dispetcher → tok o'chirish → quruq kukun/CO₂ → 101.

OU bilan 1 m dan yaqin bormang!`,
        mashq: [
          {
            prompt: "220 kV transformator yonmoqda, tokni o'chirishga vaqt yo'q",
            type: SC,
            options: [
              { text: 'Suv bilan', correct: false },
              { text: 'CO₂ (OU) bilan xavfsiz masofadan', correct: true },
              { text: 'Qo\'lda o\'chirish', correct: false },
            ],
          },
          {
            prompt: "Kuchlanish ostidagi yong'in tartibi",
            type: SC,
            options: [
              { text: "Darhol suv", correct: false },
              { text: "Dispetcher → tok o'chishi → o'chirish", correct: true },
              { text: 'Faqat 101', correct: false },
            ],
          },
          {
            prompt: 'O\'chirgichlarni moslang',
            type: MA,
            options: [
              { text: 'Suv (OV)', correct: true, match: "Taqiqlangan" },
              { text: "Ko'pik (OP)", correct: true, match: "Taqiqlangan" },
              { text: 'Kukun', correct: true, match: '1 kV gacha' },
              { text: 'CO₂ (OU)', correct: true, match: '10 kV gacha' },
            ],
          },
          {
            prompt: 'OU bilan 0,5 m dan yaqin',
            type: YN,
            options: [
              { text: 'Ha', correct: false },
              { text: "Yo'q (kamida 1 m)", correct: true },
            ],
          },
        ],
      },
      {
        title: '4.4-dars: Kimyoviy va radiatsion xavf',
        parentContent: INTRO,
        nazariya: `Transformator yog'i — yong'in; sulfat kislotasi — kuyish; vodorod — portlash; SF₆ — bo'g'ilish.

Akkumulyator xonasi: kirishdan 15 daqiqa oldin shamollatish; olov/uchqun taqiq; kislotaga chidamli ko'zoynak; portlashga chidamli asboblar.`,
        mashq: [
          {
            prompt: 'Akkumulyator xonasiga kirishdan oldin',
            type: SC,
            options: [
              { text: 'Niqob', correct: false },
              { text: 'Kamida 15 daqiqa shamollatish', correct: true },
              { text: 'Kalit bilan uchqun', correct: false },
            ],
          },
          {
            prompt: 'SF₆ chiqqan xonada oddiy niqob',
            type: YN,
            options: [
              { text: 'Ha', correct: false },
              { text: "Yo'q (kislorod apparati)", correct: true },
            ],
          },
          {
            prompt: 'Kimyoviy xavflarni moslang',
            type: MA,
            options: [
              { text: "Transformator yog'i", correct: true, match: "Yong'in" },
              { text: 'Sulfat kislotasi', correct: true, match: 'Kuyish' },
              { text: 'Vodorod', correct: true, match: 'Portlash' },
              { text: 'SF₆', correct: true, match: "Bo'g'ilish" },
            ],
          },
        ],
      },
    ],
  },
];
