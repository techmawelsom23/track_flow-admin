// 26 world hubs across 20 countries
export const WORLD_WAREHOUSES = [
  { code: 'US-JFK', warehouse: 'New York JFK Cargo Hub', city: 'New York', country: 'USA', lat: 40.6413, lng: -73.7781 },
  { code: 'US-LAX', warehouse: 'Los Angeles Distribution Center', city: 'Los Angeles', country: 'USA', lat: 33.9416, lng: -118.4085 },
  { code: 'US-HOU', warehouse: 'Houston Freight Terminal', city: 'Houston', country: 'USA', lat: 29.7604, lng: -95.3698 },
  { code: 'CN-PVG', warehouse: 'Shanghai Pudong Export Hub', city: 'Shanghai', country: 'China', lat: 31.1443, lng: 121.8083 },
  { code: 'CN-SZX', warehouse: 'Shenzhen Tech Cargo Terminal', city: 'Shenzhen', country: 'China', lat: 22.5431, lng: 114.0579 },
  { code: 'CN-CAN', warehouse: 'Guangzhou Baiyun Cargo Center', city: 'Guangzhou', country: 'China', lat: 23.1291, lng: 113.2644 },
  { code: 'DE-HAM', warehouse: 'Hamburg Freight Central', city: 'Hamburg', country: 'Germany', lat: 53.5511, lng: 9.9937 },
  { code: 'DE-FRA', warehouse: 'Frankfurt Cargo Gateway', city: 'Frankfurt', country: 'Germany', lat: 50.1109, lng: 8.6821 },
  { code: 'NL-RTM', warehouse: 'Rotterdam Europoort Warehouse', city: 'Rotterdam', country: 'Netherlands', lat: 51.9225, lng: 4.4792 },
  { code: 'NL-AMS', warehouse: 'Amsterdam Schiphol Cargo Hub', city: 'Amsterdam', country: 'Netherlands', lat: 52.3676, lng: 4.9041 },
  { code: 'AE-JEA', warehouse: 'Dubai Jebel Ali Free Zone Hub', city: 'Dubai', country: 'UAE', lat: 25.0119, lng: 55.0617 },
  { code: 'AE-DXB', warehouse: 'Dubai DXB Air Cargo Terminal', city: 'Dubai', country: 'UAE', lat: 25.2532, lng: 55.3657 },
  { code: 'GB-LON', warehouse: 'London Heathrow Cargo Terminal', city: 'London', country: 'UK', lat: 51.4700, lng: -0.4543 },
  { code: 'SG-SIN', warehouse: 'Singapore Changi Logistics Hub', city: 'Singapore', country: 'Singapore', lat: 1.3644, lng: 103.9915 },
  { code: 'JP-TYO', warehouse: 'Tokyo Narita Cargo Center', city: 'Tokyo', country: 'Japan', lat: 35.7720, lng: 140.3929 },
  { code: 'CA-TOR', warehouse: 'Toronto Gateway Hub', city: 'Toronto', country: 'Canada', lat: 43.6777, lng: -79.6248 },
  { code: 'CA-VAN', warehouse: 'Vancouver Pacific Freight Terminal', city: 'Vancouver', country: 'Canada', lat: 49.1967, lng: -123.1815 },
  { code: 'AU-SYD', warehouse: 'Sydney Port Botany Hub', city: 'Sydney', country: 'Australia', lat: -33.9500, lng: 151.2000 },
  { code: 'BR-SSZ', warehouse: 'Santos Port Cargo Terminal', city: 'Santos', country: 'Brazil', lat: -23.9608, lng: -46.3336 },
  { code: 'ZA-DUR', warehouse: 'Durban Container Terminal', city: 'Durban', country: 'South Africa', lat: -29.8587, lng: 31.0218 },
  { code: 'NG-LOS', warehouse: 'Lagos Apapa Export Hub', city: 'Lagos', country: 'Nigeria', lat: 6.4531, lng: 3.3958 },
  { code: 'IN-BOM', warehouse: 'Mumbai JNPT Cargo Hub', city: 'Mumbai', country: 'India', lat: 19.0760, lng: 72.8777 },
  { code: 'FR-LEH', warehouse: 'Le Havre Port Terminal', city: 'Le Havre', country: 'France', lat: 49.4944, lng: 0.1079 },
  { code: 'KR-PUS', warehouse: 'Busan New Port Cargo Hub', city: 'Busan', country: 'South Korea', lat: 35.0951, lng: 128.9022 },
  { code: 'TR-IST', warehouse: 'Istanbul Cargo Gateway', city: 'Istanbul', country: 'Turkey', lat: 41.0082, lng: 28.9784 },
  { code: 'SA-JED', warehouse: 'Jeddah Islamic Port Hub', city: 'Jeddah', country: 'Saudi Arabia', lat: 21.4858, lng: 39.1925 }
];

export function findWarehouse(code) {
  return WORLD_WAREHOUSES.find(w => w.code === code);
}

export function generateTrackingCode() {
  const year = new Date().getFullYear();
  const a = Math.floor(1000 + Math.random() * 9000);
  const b = Math.floor(1000 + Math.random() * 9000);
  return `TF-${year}-${a}${b}`;
}
