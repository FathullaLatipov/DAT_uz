// Reference geography. Coordinates are city centres; distances are ESTIMATES
// (great-circle × road factor) until a routing provider (OSRM/Valhalla) is plugged in.

export type CountryRef = { code: string; name: string; flag: string; aliases: string[] };
export type CityRef = {
  id: string;
  name: string;
  country: string;
  lat: number;
  lng: number;
  hub?: boolean;
  aliases: string[];
};

export const COUNTRIES: CountryRef[] = [
  { code: "UZ", name: "Uzbekistan", flag: "🇺🇿", aliases: ["uzbekistan", "узбекистан", "o'zbekiston", "ozbekiston", "uzb"] },
  { code: "KZ", name: "Kazakhstan", flag: "🇰🇿", aliases: ["kazakhstan", "казахстан", "qazaqstan", "kaz"] },
  { code: "KG", name: "Kyrgyzstan", flag: "🇰🇬", aliases: ["kyrgyzstan", "кыргызстан", "киргизия", "kgz"] },
  { code: "TJ", name: "Tajikistan", flag: "🇹🇯", aliases: ["tajikistan", "таджикистан", "tjk"] },
  { code: "TM", name: "Turkmenistan", flag: "🇹🇲", aliases: ["turkmenistan", "туркменистан", "tkm"] },
  { code: "RU", name: "Russia", flag: "🇷🇺", aliases: ["russia", "россия", "рф", "russian federation", "rus"] },
  { code: "AZ", name: "Azerbaijan", flag: "🇦🇿", aliases: ["azerbaijan", "азербайджан", "aze"] },
  { code: "TR", name: "Turkey", flag: "🇹🇷", aliases: ["turkey", "türkiye", "turkiye", "турция", "tur"] },
  { code: "CN", name: "China", flag: "🇨🇳", aliases: ["china", "китай", "prc", "chn"] },
  { code: "GE", name: "Georgia", flag: "🇬🇪", aliases: ["georgia", "грузия", "geo"] },
  { code: "BY", name: "Belarus", flag: "🇧🇾", aliases: ["belarus", "беларусь", "белоруссия", "blr"] },
  { code: "AM", name: "Armenia", flag: "🇦🇲", aliases: ["armenia", "армения", "arm"] },
];

export const CITIES: CityRef[] = [
  // Uzbekistan
  { id: "tashkent", name: "Tashkent", country: "UZ", lat: 41.2995, lng: 69.2401, hub: true, aliases: ["tashkent", "ташкент", "toshkent", "тошкент", "tas"] },
  { id: "samarkand", name: "Samarkand", country: "UZ", lat: 39.6542, lng: 66.9597, hub: true, aliases: ["samarkand", "самарканд", "самарқанд", "samarqand"] },
  { id: "bukhara", name: "Bukhara", country: "UZ", lat: 39.7747, lng: 64.4286, hub: true, aliases: ["bukhara", "бухара", "бухоро", "buxoro"] },
  { id: "andijan", name: "Andijan", country: "UZ", lat: 40.7821, lng: 72.3442, hub: true, aliases: ["andijan", "андижан", "андижон", "andijon"] },
  { id: "namangan", name: "Namangan", country: "UZ", lat: 40.9983, lng: 71.6726, aliases: ["namangan", "наманган"] },
  { id: "fergana", name: "Fergana", country: "UZ", lat: 40.3864, lng: 71.7864, hub: true, aliases: ["fergana", "фергана", "фарғона", "фаргона", "farg'ona", "fargona", "ferghana"] },
  { id: "qarshi", name: "Qarshi", country: "UZ", lat: 38.8606, lng: 65.7891, aliases: ["qarshi", "карши", "қарши", "karshi"] },
  { id: "termez", name: "Termez", country: "UZ", lat: 37.2242, lng: 67.2783, hub: true, aliases: ["termez", "термез", "термиз", "termiz"] },
  { id: "nukus", name: "Nukus", country: "UZ", lat: 42.4531, lng: 59.6103, aliases: ["nukus", "нукус"] },
  { id: "navoi", name: "Navoi", country: "UZ", lat: 40.1039, lng: 65.3688, aliases: ["navoi", "навои", "навоий", "navoiy"] },
  { id: "jizzakh", name: "Jizzakh", country: "UZ", lat: 40.1158, lng: 67.8422, aliases: ["jizzakh", "джизак", "жиззах", "jizzax", "jizakh"] },
  { id: "gulistan", name: "Gulistan", country: "UZ", lat: 40.4897, lng: 68.7842, aliases: ["gulistan", "гулистан", "гулистон", "guliston"] },
  { id: "urgench", name: "Urgench", country: "UZ", lat: 41.55, lng: 60.6333, aliases: ["urgench", "ургенч", "урганч", "urganch"] },
  { id: "kokand", name: "Kokand", country: "UZ", lat: 40.5286, lng: 70.9425, aliases: ["kokand", "коканд", "кукон", "qo'qon", "qoqon"] },
  // Kazakhstan
  { id: "almaty", name: "Almaty", country: "KZ", lat: 43.2389, lng: 76.8897, hub: true, aliases: ["almaty", "алматы", "алма-ата", "олмаота", "alma-ata", "olmaota"] },
  { id: "astana", name: "Astana", country: "KZ", lat: 51.1694, lng: 71.4491, hub: true, aliases: ["astana", "астана", "nur-sultan", "нур-султан"] },
  { id: "shymkent", name: "Shymkent", country: "KZ", lat: 42.3417, lng: 69.5901, aliases: ["shymkent", "шымкент", "chimkent", "чимкент"] },
  // Kyrgyzstan
  { id: "bishkek", name: "Bishkek", country: "KG", lat: 42.8746, lng: 74.5698, hub: true, aliases: ["bishkek", "бишкек"] },
  { id: "osh", name: "Osh", country: "KG", lat: 40.5283, lng: 72.7985, aliases: ["osh", "ош"] },
  // Tajikistan
  { id: "dushanbe", name: "Dushanbe", country: "TJ", lat: 38.5598, lng: 68.787, hub: true, aliases: ["dushanbe", "душанбе"] },
  { id: "khujand", name: "Khujand", country: "TJ", lat: 40.2826, lng: 69.6222, aliases: ["khujand", "худжанд", "khodjent"] },
  // Turkmenistan
  { id: "ashgabat", name: "Ashgabat", country: "TM", lat: 37.9601, lng: 58.3261, aliases: ["ashgabat", "ашхабад", "ашгабат", "ashkhabad"] },
  // Russia
  { id: "moscow", name: "Moscow", country: "RU", lat: 55.7558, lng: 37.6173, hub: true, aliases: ["moscow", "москва", "moskva"] },
  { id: "yekaterinburg", name: "Yekaterinburg", country: "RU", lat: 56.8389, lng: 60.6057, aliases: ["yekaterinburg", "екатеринбург", "ekaterinburg"] },
  { id: "novosibirsk", name: "Novosibirsk", country: "RU", lat: 55.0084, lng: 82.9357, aliases: ["novosibirsk", "новосибирск"] },
  { id: "saint-petersburg", name: "Saint Petersburg", country: "RU", lat: 59.9343, lng: 30.3351, aliases: ["saint petersburg", "санкт-петербург", "петербург", "спб"] },
  { id: "krasnodar", name: "Krasnodar", country: "RU", lat: 45.0355, lng: 38.9753, aliases: ["krasnodar", "краснодар"] },
  { id: "rostov", name: "Rostov-on-Don", country: "RU", lat: 47.2357, lng: 39.7015, aliases: ["rostov", "rostov-on-don", "ростов", "ростов-на-дону"] },
  { id: "nizhny-novgorod", name: "Nizhny Novgorod", country: "RU", lat: 56.2965, lng: 43.9361, aliases: ["nizhny novgorod", "нижний новгород"] },
  { id: "kazan", name: "Kazan", country: "RU", lat: 55.7963, lng: 49.1088, aliases: ["kazan", "казань"] },
  // Others
  { id: "baku", name: "Baku", country: "AZ", lat: 40.4093, lng: 49.8671, aliases: ["baku", "баку", "bakı"] },
  { id: "istanbul", name: "Istanbul", country: "TR", lat: 41.0082, lng: 28.9784, aliases: ["istanbul", "стамбул", "i̇stanbul"] },
  { id: "izmir", name: "Izmir", country: "TR", lat: 38.4237, lng: 27.1428, aliases: ["izmir", "измир", "i̇zmir"] },
  { id: "ankara", name: "Ankara", country: "TR", lat: 39.9334, lng: 32.8597, aliases: ["ankara", "анкара"] },
  { id: "urumqi", name: "Urumqi", country: "CN", lat: 43.8256, lng: 87.6168, aliases: ["urumqi", "урумчи", "ürümqi"] },
  { id: "kashgar", name: "Kashgar", country: "CN", lat: 39.4704, lng: 75.9898, aliases: ["kashgar", "кашгар", "kashi"] },
  { id: "tbilisi", name: "Tbilisi", country: "GE", lat: 41.7151, lng: 44.8271, aliases: ["tbilisi", "тбилиси"] },
  { id: "minsk", name: "Minsk", country: "BY", lat: 53.9006, lng: 27.559, aliases: ["minsk", "минск"] },
  { id: "yerevan", name: "Yerevan", country: "AM", lat: 40.1792, lng: 44.4991, aliases: ["yerevan", "ереван"] },
];

const cityById = new Map(CITIES.map((c) => [c.id, c]));
const countryByCode = new Map(COUNTRIES.map((c) => [c.code, c]));

export const getCity = (id: string) => cityById.get(id);
export const getCountry = (code: string) => countryByCode.get(code);
export const flag = (code: string) => countryByCode.get(code)?.flag ?? "🏳️";
export const countryName = (code: string) => countryByCode.get(code)?.name ?? code;

const toRad = (d: number) => (d * Math.PI) / 180;

/** Great-circle distance in km. */
export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Road-distance estimate. Mountain/border corridors get a higher factor. */
export function estimateRoadKm(fromId: string, toId: string): number {
  if (fromId === toId) return 0;
  const a = cityById.get(fromId);
  const b = cityById.get(toId);
  if (!a || !b) return NaN;
  const factor = a.country === b.country ? 1.22 : 1.3;
  return Math.round(haversineKm(a, b) * factor);
}

/** Average truck speed incl. border/rest time, for ETA estimates. */
export const AVG_KM_PER_DAY = 550;
export const estimateTransitDays = (km: number) => Math.max(1, Math.ceil(km / AVG_KM_PER_DAY));
