export type ShowroomRegion = 'NORTH' | 'CENTRAL' | 'SOUTH';

export interface Showroom {
  id: string;
  name: string;
  slug: string;
  city: string;
  region: ShowroomRegion;
  address: string;
  phone: string;
  openTime: string;
  closeTime: string;
  latitude: number;
  longitude: number;
  image: string;
  isFlagship: boolean;
}
