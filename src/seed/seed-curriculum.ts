import { QuestionType } from '../common/enums/question-type.enum';
import type { TheorySlide } from '../common/types/theory-slide';

/** Modul (Level) → dars (Theory LESSON, ildiz) → nazariya (Theory NAZARIYA, bola) → mashqlar (Question, theoryId = dars id). Slides bo'lsa nazariya matni DBda bo'sh, mazmun seed-lesson-slides.ts da. */

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

const INTRO = `ElektroLearn

Elektr xavfsizligi bo'yicha o'quv kursi
Duolingo uslubidagi interaktiv o'quv qo'llanma`;

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

Vosita nomi | Vazifasi va xususiyati | Tekshirish usuli
Himoya kaskasi | Boshni mexanik zarba va tokdan himoya qiladi. | Ichki tasmalarining mustahkamligi va yorilishlar yo'qligi tekshiriladi.
Dielektrik qo'lqop | 1000 V gacha asosiy, 1000 V dan yuqori qo'shimcha himoya. | Havo haydash usuli: Qo'lqopni o'rab, havo chiqmayotganiga ishonch hosil qiling.
Maxsus kiyim (Kombinezon) | Faqat paxtali (X/B) matodan, elektr yoyiga chidamli bo'lishi shart. | Yenglar tugmalangan va shim poyabzal ustidan tushgan bo'lishi kerak.
Himoya ko'zoynagi | Elektr yoyi chaqnashidan ko'zni asraydi. | Chizilmagan va tiniq bo'lishi shart.
Dielektrik botinka/gilamcha | "Qadam kuchlanishi"dan saqlaydi. | Teshiklar va namlik yo'qligi tekshiriladi.

🧐 Muhim
Dielektrik qo'lqoplarning sinov muddati — 6 oyda bir marta. Agar qo'lqopda "Shtamp" (muhr) bo'lmasa yoki muddati o'tgan bo'lsa, undan foydalanish o'lim bilan barobar!`,
        mashq: [
          {
            prompt:
              "1-savol: 110 kVli podstansiyada ishlash uchun 3 xil qo'lqopdan qaysi biri mos keladi?",
            type: SC,
            options: [
              { text: "Oddiy qurilish qo'lqopi", correct: false },
              { text: "Rezina xo'jalik qo'lqopi", correct: false },
              { text: '"EN" belgisi tushirilgan dielektrik qo\'lqop', correct: true },
            ],
          },
          {
            prompt: "2-savol: Dielektrik qo'lqopda igna uchidek teshik topsangiz nima qilasiz?",
            type: SC,
            options: [
              { text: 'Izolyatsiya tasmasi bilan yopishtirib ishlayman', correct: false },
              { text: "Teshik kichkina, xavfi yo'q deb hisoblayman", correct: false },
              { text: "Foydalanishni darhol to'xtataman va yaroqsizga chiqaraman", correct: true },
            ],
          },
          {
            prompt:
              "3-savol: Nima uchun sintetik (neylon, poliester) kiyimda podstansiyaga kirish taqiqlanadi?",
            type: SC,
            options: [
              {
                text: "Chunki elektr yoyi paydo bo'lganda sintetika erib, badanga yopishib qoladi va og'ir kuyishga olib keladi.",
                correct: true,
              },
              { text: 'Ruxsat etiladi', correct: false },
              { text: "Faqat yozda taqiqlanadi", correct: false },
            ],
          },
        ],
      },
      {
        title: "1.2-dars: Himoya vositalarini sinovdan o'tkazish muddatlari va me'yorlari",
        parentContent: INTRO,
        nazariya: `Bu darsda biz xodimga har bir uskunani qachon laboratoriyaga topshirish kerakligini va ishlatishdan oldin nimalarga qarashni o'rgatamiz.

1. Elektr xavfsizligi vositalari tasnifi

• Asosiy himoya vositalari: Izolyatsiyasi ishchi kuchlanishga uzoq vaqt bardosh bera oladigan vositalar (masalan, operativ shtangalar, kuchlanish ko'rsatkichlari).
• Qo'shimcha himoya vositalari: Asosiy vositaga qo'shimcha ravishda ishlatiladi, lekin yakka o'zi tokdan to'liq himoya qilolmaydi (masalan, dielektrik botinkalar, gilamchalar).

2. Sinov muddatlari jadvali (Yodda saqlash shart!)

Himoya vositasi nomi | Davriy sinov muddati | Tekshirish usuli
Dielektrik qo'lqoplar | 6 oyda 1 marta | Suvli vannada yuqori kuchlanish bilan
Operativ shtangalar | 24 oyda 1 marta | Elektr mustahkamligiga sinov
Kuchlanish ko'rsatkichlari (Indikator) | 12 oyda 1 marta | Ishga tushish kuchlanishini tekshirish
Izolyatsiyalovchi qisqichlar (Kleshi) | 24 oyda 1 marta | Izolyatsiya qatlamini tekshirish
Dielektrik botinkalar | 36 oyda 1 marta | Elektr sinovi

⚠️ Ekspert
Agar himoya vositasi yerga tushib ketgan, mexanik shikastlangan yoki nam bo'lsa — sinov muddati tugamagan bo'lsa ham, navbatdan tashqari sinovdan o'tkazilishi shart!`,
        mashq: [
          {
            prompt:
              "1-mashq (Muddati o'tganini toping): A qo'lqop: Sinov sanasi 2025-yil yanvar (Bugun: 2026-yil mart). B qo'lqop: Sinov sanasi 2025-yil noyabr. C qo'lqop: Shtampi yo'q.",
            type: SC,
            options: [
              { text: "A va C (muddati o'tgan yoki ishlatib bo'lmaydi)", correct: true },
              { text: 'Faqat B (hali 6 oy o‘tmagan)', correct: false },
              { text: 'Faqat A', correct: false },
            ],
          },
          {
            prompt: "2-mashq (Raqamlarni moslang): Qo'lqop ↔ 6 oy | Indikator ↔ 12 oy | Shtanga ↔ 24 oy | Botinka ↔ 36 oy",
            type: MA,
            options: [
              { text: "Qo'lqop", correct: true, match: '6 oy' },
              { text: 'Indikator', correct: true, match: '12 oy' },
              { text: 'Shtanga', correct: true, match: '24 oy' },
              { text: 'Botinka', correct: true, match: '36 oy' },
            ],
          },
          {
            prompt:
              "3-mashq (Ha yoki Yo'q): 'Dielektrik gilamchalar har 6 oyda laboratoriya sinovidan o'tkazilishi shart.'",
            type: YN,
            options: [
              { text: 'Ha', correct: false },
              { text: "Yo'q", correct: true },
            ],
          },
        ],
      },
      {
        title: '1.3-dars: Xavfsizlik plakatlari va belgilari (Signallar tili)',
        parentContent: INTRO,
        nazariya: `MET tizimida plakatlar 4 ta asosiy guruhga bo'linadi. Ularni adashtirish — ruxsat berilmagan hududga kirish yoki kuchlanish ostidagi uskunaga tegib ketishga sabab bo'lishi mumkin.

1. Plakatlar tasnifi va vazifalari

Guruh | Rangi | Ma'nosi | Misol
Taqiqlovchi | Qizil/Oq | Amallarni taqiqlaydi | YOQMANG! Odamlar ishlayapti
Ogohlantiruvchi | Sariq/Qora | Xavf haqida ogohlantiradi | TO'XTANG! Kuchlanish
Buyuruvchi | Ko'k/Oq | Ruxsat etilgan joyni ko'rsatadi | SHU YERDA ISHLANG
Ko'rsatuvchi | Yashil/Oq | Xavfsiz holatni bildiradi | YERLATILGAN

2. Plakatlarni ilish qoidalari (Oltin qoidalar)

• Vaqtinchalik plakatlar: Faqat ish bajarilayotgan vaqtda ilinadi va ish tugagach darhol olinadi.
• Ko'rinish darajasi: Plakatlar ishchi va navbatchi ko'zi tushadigan eng qulay balandlikda bo'lishi shart.
• Material: Metall podstansiyalarda plakatlar dielektrik (plastik yoki yog'och) materialdan bo'lishi tavsiya etiladi.

🔴 Eng muhim
"YOQMANG! Odamlar ishlayapti" plakati ilingan klyuchni hech kim (hatto bosh muhandis ham) burashga haqli emas! Uni faqat ilgan xodimning o'zi olishi mumkin.`,
        mashq: [
          {
            prompt: "1-mashq: 220 kVli ajratgich ochildi. Qaysi plakat ilinadi?",
            type: SC,
            options: [
              { text: "'Shu yerga chiqing'", correct: false },
              { text: 'YOQMANG! Odamlar ishlayapti', correct: true },
              { text: 'YERLATILGAN', correct: false },
            ],
          },
          {
            prompt: "2-mashq: Ish joyi tayyorlandi. Ishchi qayerda ishlashini qanday biladi?",
            type: SC,
            options: [
              { text: "Ogohlantiruvchi sariq plakat orqali", correct: false },
              { text: "'Shu yerda ishlang' plakati orqali (Ko'k/Oq — Buyuruvchi guruh)", correct: true },
              { text: 'Yashil YERLATILGAN orqali', correct: false },
            ],
          },
          {
            prompt: '3-mashq (Ranglar ma\'nosi): moslang',
            type: MA,
            options: [
              { text: 'Qizil plakat', correct: true, match: 'Xavfli harakatni taqiqlash' },
              { text: 'Sariq plakat', correct: true, match: 'Yaqinlashish xavfi haqida ogohlantirish' },
              { text: "Ko'k plakat", correct: true, match: 'Ruxsat etilgan nuqta' },
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
        nazariya: `Elektr qurilmalarida har qanday ish bajarishdan oldin rasmiy ruxsat olish majburiy. Bu tasodifiy kuchlanish berilishidan yoki boshqa brigadaning xato qilishidan himoya qiladi.

1. Ishlarni tashkil etishning uch usuli

Usul | Ta'rifi | Qachon qo'llaniladi
Naryad-ruxsatnoma | Yozma topshiriq: joy, vaqt, shart va brigada tarkibi ko'rsatiladi | Murakkab, ko'p vaqt talab etadigan ishlar
Farmoyish | Og'zaki yoki yozma tezkor buyruq | Oddiy, qisqa muddatli ishlar
Joriy ekspluatatsiya | Doimiy bajariladigan mayda ishlar ro'yxati | Ro'yxatga kiritilgan kichik ishlar

2. Naryad-ruxsatnomasining 7 ta majburiy elementi

1. Ish joyi — aniq ko'rsatilishi shart
2. Ish boshlanish va tugash vaqti
3. Ishga ruxsat beruvchi — kuchlanishni o'chirgan shaxs
4. Ish rahbari — brigadani boshqaruvchi
5. Brigada tarkibi — har bir a'zoning ismi va elektr xavfsizlik guruhi
6. Xavfsizlik tadbirlari — qaysi ajratgichlar ochiladi, yerlatgich o'rnatiladi
7. Imzolar — beruvchi va qabul qiluvchi imzosi

3. Naryad muddatlari va qoidalari

• Amal qilish muddati: 15 kalendar kuni
• Uzaytirish: Faqat 1 marta, yana 15 kungacha
• Yopish: Ish tugagach, ish rahbari "Ish bajarildi" deb imzo chekadi
• Saqlash muddati: 30 kun

🧐 Ekspert
Naryad ikki nusxada yoziladi: biri ishga ruxsat beruvchida, ikkinchisi ish rahbarida qoladi. Agar naryad yo'qolsa yoki shikastlansa — ishni darhol to'xtatib, yangisini olish shart!`,
        mashq: [
          {
            prompt:
              '1-savol: 110 kVli kabelni almashtirasiz — bu uch kunlik ish. Qaysi hujjat kerak?',
            type: SC,
            options: [
              { text: 'Farmoyish', correct: false },
              { text: 'Naryad-ruxsatnoma', correct: true },
              { text: "Og'zaki ruxsat", correct: false },
            ],
          },
          {
            prompt:
              '2-savol: Naryad-ruxsatnomasining amal qilish muddati ___ kalendar kuni. (Javob: 15)',
            type: SC,
            options: [
              { text: '7 kun', correct: false },
              { text: '15 kun', correct: true },
              { text: '30 kun', correct: false },
            ],
          },
          {
            prompt: "3-savol (Ha/Yo'q): Naryad muddatini ikki marta uzaytirish mumkin.",
            type: YN,
            options: [
              { text: 'Ha', correct: false },
              { text: "Yo'q", correct: true },
            ],
          },
          {
            prompt: '4-savol: Kim naryad berishga vakolatli?',
            type: SC,
            options: [
              { text: 'Ixtiyoriy navbatchi', correct: false },
              { text: "Belgilangan vakolatli shaxs (mas'ul muhandis)", correct: true },
              { text: 'Faqat dispetcher', correct: false },
            ],
          },
        ],
      },
      {
        title: '2.2-dars: Kuchlanish ostidagi qismlargacha xavfsiz masofalar',
        parentContent: INTRO,
        nazariya: `Elektr toki urishi uchun simga tegish shart emas. Kuchlanish qanchalik yuqori bo'lsa, havo orqali elektr yoyi sakrashi mumkin bo'lgan masofa shunchalik katta bo'ladi.

1. Minimal xavfsiz masofalar jadvali

Kuchlanish darajasi | Ishchi xodimgacha minimal masofa | Asbob-uskunagacha masofa
1 kV gacha | 0,3 m | 0,6 m
1–35 kV | 0,6 m | 0,6 m
110 kV | 1,0 m | 1,0 m
220 kV | 2,0 m | 2,0 m
500 kV | 3,5 m | 3,5 m
750 kV | 5,0 m | 5,0 m

2. "Qadam kuchlanishi" xavfi

Yerga tushgan sim atrofida ham xavfli zona mavjud. Yer bo'ylab tarqalayotgan tok "qadam kuchlanishi" hosil qiladi.
• Xavfli radius: simdan 8 metr gacha
• Harakat qilish usuli: Kichik qadamlar bilan yoki bir oyoqda sakrab (bir oyoq usuli) yoy markazidan uzoqlashish

🧐 Muhim
220 kV li qurilmada ishlar olib borayotganda, hatto 2 metr masofada turgan holda ham uzun metall asbob ko'tarib turish mumkin emas — u elektr yoyini jalb qilishi mumkin!`,
        mashq: [
          {
            prompt: '1-savol (Simulyatsiya): 220 kVli shinoprovod. 1,5 m masofada holat?',
            type: SC,
            options: [
              { text: '🔴 XAVF!', correct: true },
              { text: '🟢 Xavfsiz', correct: false },
            ],
          },
          {
            prompt: '2-savol (Simulyatsiya): 220 kVli shinoprovod. 2,5 m masofada holat?',
            type: SC,
            options: [
              { text: '🔴 XAVF!', correct: false },
              { text: '🟢 Xavfsiz!', correct: true },
            ],
          },
          {
            prompt: '3-savol (Moslang): 110 kV ↔ 1,0 m | 220 kV ↔ 2,0 m | 35 kV ↔ 0,6 m | 500 kV ↔ 3,5 m',
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
