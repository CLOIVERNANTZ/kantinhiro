export interface DailyGreetingData {
  timeGreeting: string
  dayName: string
  sweetRemark: string
}

const DAILY_SWEET_REMARKS: Record<number, [string, string, string]> = {
  // Minggu
  0: [
    'Selamat hari Minggu! Nikmati waktumu dengan tenang sebelum minggu baru dimulai. ☀️',
    'Minggu santai memang paling pas buat isi ulang energi dan makan yang bikin bahagia. 💛',
    'Semoga hari Minggumu penuh ketenangan dan kehangatan bersama orang-orang tersayang! ✨',
  ],
  // Senin
  1: [
    'Awali Senin dengan makanan favoritmu, biar semangatnya full sampai sore! ✨',
    'Senin baru, energi baru. Jangan lupa makan yang enak hari ini ya, kamu hebat! 💛',
    'Pelan-pelan aja hadapin Seninnya, yang penting perut jangan sampai kosong ya~ 🍜',
  ],
  // Selasa
  2: [
    'Selasa ceria! Yuk manjain diri sebentar sama menu favoritmu hari ini. 😊',
    'Semoga hari Selasamu semanis es teh manis dan sehangat nasi pulen ya! ✨',
    'Lagi sibuk-sibuknya hari Selasa? Istirahat sebentar dan isi tenaga dulu yuk! 💛',
  ],
  // Rabu
  3: [
    'Sudah pertengahan minggu nih! Jangan lupa kasih reward buat dirimu lewat makan enak hari ini. 🌟',
    'Rabu tenang, hati senang—apalagi kalau ditemani menu andalan di Kantin Hiro! 😋',
    'Tetap semangat di hari Rabu ya! Makan siang yang lezat bakal bikin mood balik ceria lagi. 🍛',
  ],
  // Kamis
  4: [
    'Kamis manis, semoga urusan dan rezekimu hari ini lancar terus ya! Jangan telat makan~ 💛',
    'Sebentar lagi weekend! Isi dulu amunisi hari Kamis ini biar makin produktif. ✨',
    'Apa pun kesibukanmu di hari Kamis, perut yang kenyang selalu jadi penyelamat mood! 😊',
  ],
  // Jumat
  5: [
    'Jumat berkah! Semoga segala urusanmu hari ini dimudahkan dan selalu dilimpahi kebaikan. 🤲✨',
    'Happy Friday! Rayakan akhir pekan kerja dengan hidangan spesial pilihanmu hari ini. 🎉',
    'Selamat hari Jumat! Yuk makan yang enak dulu biar senyumnya makin manis menjelang weekend. 💛',
  ],
  // Sabtu
  6: [
    'Selamat berakhir pekan! Semoga Sabtumu santai, hangat, dan penuh hal-hal menyenangkan. 🌸',
    'Sabtu produktif atau santai? Dua-duanya makin nikmat kalau ditemani makanan favorit! 😋',
    'Happy Saturday! Jangan lupa jaga kesehatan dan isi tenaga dengan makanan lezat hari ini. ✨',
  ],
}

const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']

/**
 * Returns Jakarta (WIB) time-of-day greeting and a day-specific sweet remark (3 variations per day).
 */
export function getJakartaWelcomeGreeting(variantSeed?: number): DailyGreetingData {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jakarta',
    weekday: 'short',
    hour: 'numeric',
    hour12: false,
  }).formatToParts(new Date())

  const hourPart = Number(parts.find(p => p.type === 'hour')?.value ?? new Date().getHours())
  const hour = hourPart === 24 ? 0 : hourPart

  let timeGreeting = 'Selamat Malam'
  if (hour < 11) timeGreeting = 'Selamat Pagi'
  else if (hour < 15) timeGreeting = 'Selamat Siang'
  else if (hour < 18) timeGreeting = 'Selamat Sore'

  const weekdayShort = parts.find(p => p.type === 'weekday')?.value || ''
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  }
  const dayIndex = weekdayMap[weekdayShort] ?? new Date().getDay()
  const remarks = DAILY_SWEET_REMARKS[dayIndex] || DAILY_SWEET_REMARKS[1]
  const index = typeof variantSeed === 'number'
    ? Math.abs(variantSeed) % remarks.length
    : Math.floor(Math.random() * remarks.length)

  return {
    timeGreeting,
    dayName: DAY_NAMES[dayIndex] || 'Hari Ini',
    sweetRemark: remarks[index],
  }
}
