import type { TheorySlide } from '../common/types/theory-slide';

export const LESSON_SLIDES: Record<string, TheorySlide[]> = {
  "1.1": [
    {
      "head": "Uchta asosiy xavf",
      "items": [
        "⚡ Elektr toki urishi (bevosita yoki yoy)",
        "🔥 Elektr yoyi — juda yuqori harorat",
        "💥 Mexanik shikastlanishlar (balandlik, zarba)"
      ]
    },
    {
      "head": "5 ta asosiy SHHV",
      "items": [
        "🪖 Kaska — tok va mexanik zarbadan",
        "🧤 Dielektrik qo'lqop — 1000 V gacha",
        "👔 Kombinezon — faqat paxta (X/B) matosi",
        "👓 Ko'zoynagi — yoy chaqnashidan",
        "🥾 Dielektrik botinka — qadam kuchlanishidan"
      ]
    },
    {
      "head": "⚠️ Muhim qoida!",
      "warn": true,
      "items": [
        "Dielektrik qo'lqoplarning sinov muddati 6 oyda 1 marta.",
        "Shtampi yo'q yoki muddati o'tgan qo'lqopdan foydalanish O'LIM BILAN BAROBAR!"
      ]
    }
  ],
  "1.2": [
    {
      "head": "Himoya vositalari 2 turga bo'linadi",
      "items": [
        "🔵 Asosiy: kuchlanishga to'liq bardosh (shtanga, indikator, kleschi)",
        "⚪ Qo'shimcha: asosiy bilan birga ishlatiladi (botinka, gilamcha, qo'lqop)"
      ]
    },
    {
      "head": "Sinov muddatlari jadvali",
      "items": [
        "🧤 Dielektrik qo'lqop → 6 oy",
        "📏 Kuchlanish indikatori → 12 oy",
        "🪄 Operativ shtanga → 24 oy",
        "✂️ Izolyatsiyalovchi kleschi → 24 oy",
        "🥾 Dielektrik botinka → 36 oy"
      ]
    },
    {
      "head": "⚠️ Navbatdan tashqari sinov!",
      "warn": true,
      "items": [
        "Vosita yerga tushgan, mexanik shikastlangan yoki nam bo'lsa —",
        "Muddatidan qat'iy nazar, darhol sinovdan o'tkaziladi!"
      ]
    }
  ],
  "1.3": [
    {
      "head": "4 ta plakat guruhi",
      "items": [
        "🔴 Taqiqlovchi (Qizil/Oq): 'YOQMANG! Odamlar ishlayapti'",
        "🟡 Ogohlantiruvchi (Sariq/Qora): 'TO'XTANG! Kuchlanish'",
        "🔵 Buyuruvchi (Ko'k/Oq): 'SHU YERDA ISHLANG'",
        "🟢 Ko'rsatuvchi (Yashil/Oq): 'YERLATILGAN'"
      ]
    },
    {
      "head": "Plakatlarni ilish qoidalari",
      "items": [
        "📌 Faqat ish davomida — tugagach darhol olinadi",
        "👁️ Ko'z darajasida — hamma ko'rishi shart",
        "🏗️ Metall podstansiyada plastik/yog'och material"
      ]
    },
    {
      "head": "⚠️ Eng muhim plakat!",
      "warn": true,
      "items": [
        "'YOQMANG! Odamlar ishlayapti' plakatini —",
        "Faqat uni ILGAN XODIMNING O'ZI olishi mumkin!",
        "Bosh muhandis ham, direktor ham — HAQLI EMAS!"
      ]
    }
  ],
  "2.1": [
    {
      "head": "Ish ruxsatining 3 turi",
      "items": [
        "📝 Naryad-ruxsatnoma: yozma topshiriq, murakkab ishlar uchun",
        "📞 Farmoyish: og'zaki/yozma tezkor buyruq, oddiy ishlar",
        "📋 Joriy ekspluatatsiya: doimiy mayda ishlar ro'yxati"
      ]
    },
    {
      "head": "Naryadning 7 ta majburiy elementi",
      "items": [
        "1. Ish joyi (aniq)  2. Boshlanish/tugash vaqti",
        "3. Ruxsat beruvchi  4. Ish rahbari",
        "5. Brigada tarkibi  6. Xavfsizlik tadbirlari",
        "7. Ikki taraf imzosi"
      ]
    },
    {
      "head": "Naryad muddatlari",
      "items": [
        "⏰ Amal qilish: 15 kalendar kuni",
        "🔄 Uzaytirish: faqat 1 marta (yana 15 kun)",
        "📄 Nusxa soni: 2 ta",
        "📁 Saqlash muddati: 30 kun"
      ]
    }
  ],
  "2.2": [
    {
      "head": "Elektr yoyi xavfi",
      "items": [
        "⚡ Simga tegish shart emas — havo orqali yoy sakraydi!",
        "📈 Kuchlanish qanchalik yuqori → masofa shunchalik katta",
        "☠️ 'Flashover' — elektr yoyi hodisasi bir zumda sodir bo'ladi"
      ]
    },
    {
      "head": "Minimal xavfsiz masofalar",
      "items": [
        "1 kV gacha → 0.3 m  |  1–35 kV → 0.6 m",
        "110 kV → 1.0 m  |  220 kV → 2.0 m",
        "500 kV → 3.5 m  |  750 kV → 5.0 m"
      ]
    },
    {
      "head": "⚠️ Qadam kuchlanishi!",
      "warn": true,
      "items": [
        "Yerga tushgan sim atrofida 8 metr xavfli zona!",
        "Harakat: kichik qadamlar yoki bir oyoq usulida uzoqlashing.",
        "Yugurish va sakrash qat'iyan taqiqlangan!"
      ]
    }
  ],
  "2.3": [
    {
      "head": "Ruxsat zonalari tizimi",
      "items": [
        "Erkin zona — ma'muriy binolar, nazorat xonasi — barcha xodimlar",
        "Nazorat ostidagi zona — qurilmalar yaqinidagi o'tish yo'llari — elektr xavfsizlik guruhiga ega xodimlar",
        "Cheklangan zona — to'g'ridan-to'g'ri kuchlanish ostidagi qurilmalar — faqat ruxsat etilgan brigada a'zolari"
      ]
    },
    {
      "head": "Asosiy qoidalar",
      "items": [
        "🛤️ Faqat yo'laklar bo'ylab yuring",
        "🚪 Shkaf eshiklarini doim yopiq tuting",
        "👫 Yolg'iz kirish — TAQIQLANGAN!",
        "🚫 Yugurish man etilgan (avariyada ham)"
      ]
    },
    {
      "head": "⚠️ Eng xavfli odat!",
      "warn": true,
      "items": [
        "'Men avval ko'rib kelaman' — eng xavfli fikr!",
        "III guruhli xodim ham yolg'iz kirishi TAQIQLANADI!",
        "Ko'p avariyalar aynan shu sababdan yuz bergan."
      ]
    }
  ],
  "3.1": [
    {
      "head": "To'g'ri o'chirish tartibi",
      "items": [
        "1️⃣ Yukni kamaytirish",
        "2️⃣ Ajratgich (выключатель) o'chirish",
        "3️⃣ Razedinitelni ochish",
        "4️⃣ Blokirovka qilish + plakat ilish"
      ]
    },
    {
      "head": "Blokirovka tartibi",
      "items": [
        "Masofadan boshqarish pultidagi klyuchni oling",
        "Klyuchga shaxsiy qulf osilib, kalitni o'zingizda saqlang",
        "\"YOQMANG! Odamlar ishlayapti\" plakatini ilib qo'ying"
      ]
    },
    {
      "head": "'Barcha tomonlardan o'chirish' tamoyili",
      "items": [
        "🔄 Asosiy liniya kuchlanishi",
        "🔄 Zaxira manbadan kuchlanish",
        "🔄 Transformatorning teskari tarafidan kuchlanish",
        "⚠️ Har bir manbani ALOHIDA o'chirish shart!"
      ]
    },
    {
      "head": "🔴 O'ldiruvchi xato!",
      "warn": true,
      "items": [
        "Avval razedinitelni ochib, keyin ajratgichni o'chirish MUMKIN EMAS!",
        "Razedinitel yuk ostida ochilmaydi — bu kuchli yoy hosil qiladi.",
        "Bu xato o'lim bilan tugashi mumkin!"
      ]
    }
  ],
  "3.2": [
    {
      "head": "Nima uchun tekshirish shart?",
      "items": [
        "🔧 Texnik nosozlik bo'lishi mumkin",
        "👤 Inson xatosi bo'lishi mumkin",
        "⚡ Boshqa manba kuchlanish bergan bo'lishi mumkin",
        "📋 Qoida: tekshirmasdan ishlash = o'lim xavfi!"
      ]
    },
    {
      "head": "Tekshirish algoritmi (3 qadam)",
      "items": [
        "1️⃣ Ko'rsatkichni kuchlanish BOR simda sinash",
        "2️⃣ A, B, C — uchala fazani ketma-ket tekshirish",
        "3️⃣ Yana kuchlanish bor simda ishlashini tasdiqlash"
      ]
    },
    {
      "head": "Ko'rsatkich turlari (qisqacha)",
      "items": [
        "UVN-90 — 1 kV gacha — neon chiroq yonishi",
        "UVNF — 6–110 kV — tovush va yorug'lik signali",
        "UVN-10 — 6–10 kV — kontakt turi",
        "Kontaktsiz indikator — keng diapazon — elektromagnit maydon"
      ]
    },
    {
      "head": "⚠️ Eng xavfli yanglishish!",
      "warn": true,
      "items": [
        "Ko'rsatkich batareyasi tugagan bo'lishi mumkin!",
        "Signal bermadi ≠ kuchlanish yo'q.",
        "Tekshirishdan OLDIN ham, KEYIN ham sinab ko'ring!"
      ]
    }
  ],
  "3.3": [
    {
      "head": "Nima uchun yerlatgich o'rnatiladi?",
      "items": [
        "🔄 Boshqa brigada tasodifan kuchlanish bersa",
        "📡 Yaqin liniya induksiya hosil qilsa",
        "⚡ Statik zaryad to'plansa",
        "🛡️ Yerlatgich zaryadni yerga olib ketadi"
      ]
    },
    {
      "head": "O'RNATISH tartibi (oltin qoida)",
      "items": [
        "1️⃣ ER shinasiga ulang",
        "2️⃣ Faza A ga ulang",
        "3️⃣ Faza B ga ulang",
        "4️⃣ Faza C ga ulang",
        "🔴 Tamoyil: Avval YER — keyin FAZA!"
      ]
    },
    {
      "head": "YECHISH tartibi (teskarisi!)",
      "items": [
        "1️⃣ Faza C ni uzing",
        "2️⃣ Faza B ni uzing",
        "3️⃣ Faza A ni uzing",
        "4️⃣ ER shinasidan uzing",
        "🔴 Tamoyil: Avval FAZA — keyin YER!"
      ]
    },
    {
      "head": "Yerlatgich qayerda bo'lishi shart",
      "items": [
        "Ish joyining har ikki tomonida (manba va iste'molchi tarafida)",
        "Uzun kabel: har 200 m da bir marta",
        "Ko'rinmaydigan tomonlarda ham o'rnatilishi shart",
        "Ko'chma yerlatgich mis kesimi 25 mm² dan kam bo'lmasin"
      ]
    }
  ],
  "3.4": [
    {
      "head": "To'siq turlari",
      "items": [
        "🔶 Izolyatsiyalangan to'siq — kuchlanish yaqinida ishlanganda",
        "🟡 Saqlash lentasi — xavfli zonani belgilash (sariq-qora)",
        "🟦 Ko'chma panel — hajmli xavfli zona uchun"
      ]
    },
    {
      "head": "Ish joyini tayyorlashda 4 plakat",
      "items": [
        "🔴 Klyuchga: 'YOQMANG! Odamlar ishlayapti'",
        "🟡 Kuchlanish yoniga: 'TO'XTANG! Kuchlanish'",
        "🔵 Ish joyiga: 'SHU YERDA ISHLANG'",
        "🟢 Yerlatgich yoniga: 'YERLATILGAN'"
      ]
    },
    {
      "head": "⚠️ To'siq qoidasi!",
      "warn": true,
      "items": [
        "To'siqni faqat ISHGA RUXSAT BERUVCHI o'zgartirishi mumkin!",
        "Xodim o'z ixtiyori bilan to'siqni siljitsa —",
        "NARYAD BEKOR QILINADI!"
      ]
    }
  ],
  "3.5": [
    {
      "head": "5 oltin qoidani eslang!",
      "items": [
        "1️⃣ Kuchlanishni o'chirish — BARCHA tomonlardan",
        "2️⃣ Kuchlanish yo'qligini tekshirish — ko'rsatkich bilan",
        "3️⃣ Yerlatish — ER → Faza tartibida",
        "4️⃣ To'siqlar o'rnatish — ruxsat beruvchi tomonidan",
        "5️⃣ Plakatlar ilish — to'g'ri joyga, to'g'ri plakat"
      ]
    },
    {
      "head": "Tartib buzilmasin!",
      "items": [
        "❌ Bitta qadamni o'tkazib yuborish = HAYOT XAVFI",
        "✅ Barcha 5 qadamni bajarish = XAVFSIZ ish",
        "📋 Bu qoidalar qonun kuchiga ega — majburiy!"
      ]
    }
  ],
  "4.1": [
    {
      "head": "⚠️ Birinchi qoida!",
      "warn": true,
      "items": [
        "Jabrlanuvchiga YALANG'OCH QO'L BILAN TEGMANG!",
        "Tok hali o'tib turgan bo'lsa — siz ham urilasiz!",
        "Avval xavfsiz ajratish usulini qo'llang!"
      ]
    },
    {
      "head": "Tokdan ajratish usullari",
      "items": [
        "🔌 Klyuch yaqinda → darhol o'chiring",
        "🪵 Quruq tayoq bilan simni surting",
        "👕 Quruq kiyimdan (yoqa) bir qo'llib torting",
        "🔝 Balandda → avval kuchlanishni o'chiring"
      ]
    },
    {
      "head": "YOR — 6 qadam algoritmi",
      "items": [
        "1. Tokdan ajrating  2. Xavfsiz joyga o'tkaring",
        "3. Hushini tekshiring  4. Nafas tekshiring (10s)",
        "5. 112 ga qo'ng'iroq  6. YOR: 30 siqish + 2 nafas"
      ]
    },
    {
      "head": "YOR — texnikasi (30:2)",
      "items": [
        "Ko'krak siqish: 30 marta, chuqurlik 5–6 sm, tezlik 100–120/daqiqa",
        "Sun'iy nafas: 2 marta — bosh orqaga, iyak ko'tarilgan",
        "Nisbat 30:2 — 30 ta siqish + 2 ta nafas = 1 sikl"
      ]
    }
  ],
  "4.2": [
    {
      "head": "Balandlikda ishlash ta'rifi",
      "items": [
        "📏 1.8 metr va undan yuqori → balandlik ishi!",
        "🔒 Xavfsizlik kamari (poyasi) — majburiy",
        "👥 Ikkinchi xodim pastda turishi — majburiy",
        "📋 Maxsus ruxsat talab etiladi"
      ]
    },
    {
      "head": "Narvon qoidalari",
      "items": [
        "📐 Burchak: 70–75 daraja",
        "🤝 Tag: ikkinchi xodim ushlab turadi",
        "⬆️ Eng yuqori pog'ona: tepadan 3-chi",
        "🙌 Doim ikki qo'l narvonda — asbob bitta qo'lda"
      ]
    },
    {
      "head": "Kamar mahkamlanish qoidasi",
      "items": [
        "🔗 Karabin nuqtasi: beldan YUQORIDA bo'lishi shart!",
        "⬇️ Karabin past → yiqilganda katta zarba",
        "🚫 Shamol, tuman, yomg'ir, yolg'izlikda — TAQIQLANGAN"
      ]
    }
  ],
  "4.3": [
    {
      "head": "🔴 Asosiy qoida!",
      "warn": true,
      "items": [
        "Kuchlanish ostidagi uskunalarni SUV BILAN O'CHIRIB BO'LMAYDI!",
        "Suv — elektr o'tkazuvchi. Tok siz orqali o'tadi!",
        "Avval kuchlanishni o'chiring — keyin o'chirishni boshlang!"
      ]
    },
    {
      "head": "CO₂ (OU) o'chirgich bilan",
      "warn": true,
      "items": [
        "Kuchlanish ostidagi qurilmaga OU bilan 1 metrdan yaqin bormang!"
      ]
    },
    {
      "head": "Yong'in o'chirgichlar taqqosi",
      "items": [
        "❌ Suv (OV): faqat o'chirilgan qurilma",
        "❌ Ko'pik (OP): kuchlanishda taqiqlangan",
        "✅ Kukun (OP): 1 kV gacha",
        "✅ CO₂ (OU): 10 kV gacha — elektr uchun asosiy",
        "✅ Aerozol: yuqori kuchlanishli transformer"
      ]
    },
    {
      "head": "To'g'ri harakat algoritmi",
      "items": [
        "1️⃣ Xavfsiz masofaga cheking",
        "2️⃣ Dispetcherga xabar: kuchlanishni o'ching!",
        "3️⃣ Kuchlanish o'chirilganini tekshiring",
        "4️⃣ O'chirishni boshlang",
        "5️⃣ 101 (Yong'in xizmati) ga qo'ng'iroq qiling"
      ]
    }
  ],
  "4.4": [
    {
      "head": "Podstansiyalardagi kimyoviy xavflar",
      "items": [
        "🛢️ Transformer yog'i → yong'in + teri kuyishi",
        "🧪 Sulfat kislota (akkumulator) → kimyoviy kuyish",
        "💨 Vodorod gazi (akkumulator xonasi) → portlash!",
        "💨 SF₆ gazi (gaz izolyatsiya) → bo'g'ilish xavfi"
      ]
    },
    {
      "head": "Akkumulyator xonasi qoidalari",
      "items": [
        "⏱️ Kirish: 15 daqiqa OLDIN shamollatish yoqiladi",
        "🚫 Olov va uchqun taqiqlanadi",
        "👓 Kislotaga chidamli ko'zoynaklar kerak",
        "⚡ Faqat portlashga chidamli qurilmalar"
      ]
    },
    {
      "head": "SF₆ gaz chiqishi",
      "items": [
        "☠️ SF₆ — og'ir gaz, yer sathida to'planadi",
        "🫁 Kislorodni siqib chiqaradi — bo'g'ilish",
        "🛡️ Oddiy niqob YORDAM BERMAYDI!",
        "✅ Faqat kislorod apparati (izolyatsiyalovchi)"
      ]
    }
  ],
};
