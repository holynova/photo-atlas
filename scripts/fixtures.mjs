// All dates and locations here are invented for the demo.
const scenarios = [
  ["CN-FJ","2015-03-12",28,7], ["CN-JX","2015-10-03",3,1],
  ["CN-FJ","2016-03-12",32,9], ["CN-HI","2016-12-19",5,1],
  ["CN-HB","2017-04-09",36,6], ["CN-AH","2017-09-15",4,1],
  ["CN-HB","2018-03-16",31,6], ["IS-1","2018-11-09",4,1],
  ["CN-HB","2019-04-12",35,8], ["CN-FJ","2019-09-12",7,2],
  ["CN-GZ","2020-04-21",35,5], ["CN-HN","2020-09-02",9,1],
  ["CN-GZ","2021-03-21",38,6], ["CN-JX","2021-07-02",8,1],
  ["CN-GZ","2022-04-25",33,7], ["CN-FJ","2022-09-12",6,1], ["FI-18","2022-12-20",5,1],
  ["CN-GZ","2023-04-20",31,8], ["CN-HB","2023-09-12",8,1], ["NZ-WGN","2023-12-14",7,1],
  ["CN-GZ","2024-04-10",28,7], ["CN-HI","2024-09-18",12,1],
  ["CN-GZ","2025-03-08",31,5], ["CN-AH","2025-06-18",10,1], ["IS-1","2025-11-08",5,1]
];

export function makeFixture(regions) {
  const byId=new Map(regions.map((region)=>[region.id,region]));
  const cities={}, photos=[];
  for (const [city,start,days,spacing] of scenarios) {
    const region=byId.get(city);
    if (!region) throw new Error("Fixture boundary missing: " + city);
    const {polygons,...metadata}=region;
    cities[city]=metadata;
    for (let i=0;i<days;i++) {
      const stamp=new Date(Date.parse(start)+86400000*i*spacing).toISOString();
      const id=photos.length+1;
      photos.push({id,path:"DEMO-"+String(id).padStart(4,"0"),stamp,city,lat:null,lon:null,status:"done"});
    }
  }
  return {photos,cities,regions:regions.filter((region)=>!region.domestic && Object.hasOwn(cities,region.id))};
}
