// 'use client';

// import React, { useEffect, useState, Suspense } from 'react';
// import { useSearchParams } from 'next/navigation';
// import { Download, Loader2, Plane, FileText, Printer } from 'lucide-react';
// import { motion } from 'framer-motion';
// import { jsPDF } from 'jspdf';

// interface FlightReportData {
//   serialNo?: string;
//   airlineName?: string;
//   flightNo?: string;
//   aircraftType?: string;
//   aircraftRegnNo?: string;
//   terminalCode?: string;
//   staDate?: string;
//   staTime?: string;
//   stdDate?: string;
//   stdTime?: string;
//   ataDate?: string;
//   ataTime?: string;
//   atdDate?: string;
//   atdTime?: string;
//   etdTime?: string;
//   bayNo?: string;
//   gateNo?: string;
//   routing?: string;
//   ops?: string;
//   mtow?: string;
//   baseFlight?: string;
//   totalDelay?: string;
//   status?: string;
//   igmNo?: string;
//   egmNo?: string;
//   adcNo?: string;
//   ficNo?: string;
//   cntOpened?: string;
//   cntClosed?: string;
//   boardingOpened?: string;
//   boardingClosed?: string;
//   arrivalPax?: number;
//   departurePax?: number;
//   arrivalBag?: number;
//   departureBag?: number;
//   cleaningFrom?: string;
//   cleaningTo?: string;
//   frontOpen?: string;
//   frontClose?: string;
//   rearOpen?: string;
//   rearClose?: string;
//   bulkOpen?: string;
//   bulkClose?: string;
//   mainOpen?: string;
//   mainClose?: string;
//   lastActivityTimeOnHold?: string;
//   transitCargo?: string;
//   uldArrived?: number;
//   uldPlanned?: number;
//   uldDeparted?: number;
//   cargoArrived?: number;
//   cargoPlanned?: number;
//   cargoDeparted?: number;
//   mailArrived?: number;
//   mailPlanned?: number;
//   mailDeparted?: number;
//   cargoPcsIn?: number;
//   cargoPcsOut?: number;
//   courierIn?: number;
//   courierOut?: number;
//   cabinConfigF?: number;
//   cabinConfigC?: number;
//   cabinConfigY?: number;
//   arrHallFirst?: string;
//   arrHallLast?: string;
//   bmaFirst?: string;
//   bmaLast?: string;
//   wchcArr?: number;
//   wchsArr?: number;
//   wchrArr?: number;
//   wchcDep?: number;
//   wchsDep?: number;
//   wchrDep?: number;
//   holdConfigLDC?: number;
//   holdConfigLDP?: number;
//   holdConfigMDP?: number;
//   ghRemarks?: string;
//   airlineRemarks?: string;
//   ghRepName?: string;
//   airlineRepName?: string;
//   verifiedBy?: string;
//   verifiedDate?: string;
//   delayReasons?: Array<{ delay: string; reason: string }>;
// }

// function formatDisplayDate(dateStr: string): string {
//   if (!dateStr?.trim()) return '';
//   const parts = dateStr.trim().split(/[-/]/);
//   if (parts.length !== 3) return dateStr;
//   const [d, m, y] = parts;
//   return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
// }

// function formatTime(timeStr: string): string {
//   if (!timeStr?.trim()) return '';
//   const parts = timeStr.trim().split(':');
//   if (parts.length >= 2) {
//     return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}`;
//   }
//   return timeStr;
// }

// function getLoggedInUserName(): string {
//   if (typeof window === 'undefined') return 'User';
//   try {
//     const userStr = localStorage.getItem('user') || sessionStorage.getItem('user');
//     if (userStr) {
//       const user = JSON.parse(userStr);
//       return user?.name || user?.username || user?.email || 'User';
//     }
//   } catch {
//     // ignore
//   }
//   return 'User';
// }

// function FHRReportContent() {
//   const searchParams = useSearchParams();
//   const [loading, setLoading] = useState(true);
//   const [data, setData] = useState<FlightReportData | null>(null);
//   const [logoBase64, setLogoBase64] = useState<string | null>(null);
//   const [downloading, setDownloading] = useState(false);

//   const flightSlNo = searchParams.get('flightSlNo') || '';
//   const flightNo = searchParams.get('flightNo') || '';
//   const airline = searchParams.get('airline') || '';
//   const aircraft = searchParams.get('aircraft') || '';
//   const staDate = searchParams.get('staDate') || '';
//   const staTime = searchParams.get('staTime') || '';
//   const stdDate = searchParams.get('stdDate') || '';
//   const stdTime = searchParams.get('stdTime') || '';

//   function mapServerResponseToData(serverRes: any): FlightReportData {
//     if (!serverRes) return { serialNo: flightSlNo };
    
//     return {
//       serialNo: String(serverRes.serialNo || serverRes.slNo || flightSlNo),
//       airlineName: serverRes.airlineName || serverRes.airline || airline,
//       flightNo: serverRes.flightNo || serverRes.flightCode || flightNo,
//       aircraftType: serverRes.aircraftType || serverRes.aircraft || aircraft,
//       aircraftRegnNo: serverRes.aircraftRegnNo || serverRes.regnNo || serverRes.registrationNo,
//       terminalCode: serverRes.terminalCode,
//       staDate: serverRes.staDate || staDate,
//       staTime: serverRes.staTime || staTime,
//       stdDate: serverRes.stdDate || stdDate,
//       stdTime: serverRes.stdTime || stdTime,
//       ataDate: serverRes.ataDate,
//       ataTime: serverRes.ataTime,
//       atdDate: serverRes.atdDate,
//       atdTime: serverRes.atdTime,
//       etdTime: serverRes.etdTime,
//       bayNo: serverRes.bayNo,
//       gateNo: serverRes.gateNo,
//       routing: serverRes.routing || serverRes.route,
//       ops: serverRes.ops,
//       mtow: serverRes.mtow,
//       baseFlight: serverRes.baseFlight || (serverRes.stationBaseNightHalt ? 'Y' : 'N'),
//       totalDelay: serverRes.totalDelay || serverRes.departureDelay,
//       status: serverRes.status || serverRes.turnaroundStatus || serverRes.departureStatus,
//       igmNo: serverRes.igmNo,
//       egmNo: serverRes.egmNo,
//       adcNo: serverRes.adcNo,
//       ficNo: serverRes.ficNo,
//       cntOpened: serverRes.cntOpenedTime || serverRes.cntOpened,
//       cntClosed: serverRes.cntClosedTime || serverRes.cntClosed,
//       boardingOpened: serverRes.boardingOpenedTime || serverRes.boardingOpened,
//       boardingClosed: serverRes.boardingClosedTime || serverRes.boardingClosed,
//       arrivalPax: serverRes.arrivalPax,
//       departurePax: serverRes.departurePax,
//       arrivalBag: serverRes.arrivalBag,
//       departureBag: serverRes.departureBag,
//       cleaningFrom: serverRes.cleaningFromTime || serverRes.cleaningFrom,
//       cleaningTo: serverRes.cleaningToTime || serverRes.cleaningTo,
//       frontOpen: serverRes.cargoCompartmentFrontOpen || serverRes.frontOpen,
//       frontClose: serverRes.cargoCompartmentFrontClose || serverRes.frontClose,
//       rearOpen: serverRes.cargoCompartmentRearOpen || serverRes.rearOpen,
//       rearClose: serverRes.cargoCompartmentRearClose || serverRes.rearClose,
//       bulkOpen: serverRes.cargoCompartmentBulkOpen || serverRes.bulkOpen,
//       bulkClose: serverRes.cargoCompartmentBulkClose || serverRes.bulkClose,
//       mainOpen: serverRes.cargoCompartmentMainOpen || serverRes.mainOpen,
//       mainClose: serverRes.cargoCompartmentMainClose || serverRes.mainClose,
//       lastActivityTimeOnHold: serverRes.lastActivityTimeOnHold,
//       transitCargo: serverRes.transitCargo,
//       uldArrived: serverRes.uldCargoArrived || serverRes.uldArrived,
//       uldPlanned: serverRes.uldCargoPlanned || serverRes.uldPlanned,
//       uldDeparted: serverRes.uldCargoDeparted || serverRes.uldDeparted,
//       cargoArrived: serverRes.cargoArrived,
//       cargoPlanned: serverRes.cargoPlanned,
//       cargoDeparted: serverRes.cargoDeparted,
//       mailArrived: serverRes.mailArrived,
//       mailPlanned: serverRes.mailPlanned,
//       mailDeparted: serverRes.mailDeparted,
//       cargoPcsIn: serverRes.cargoPcsIn,
//       cargoPcsOut: serverRes.cargoPcsOut,
//       courierIn: serverRes.courierIn,
//       courierOut: serverRes.courierOut,
//       cabinConfigF: serverRes.cabinConfigF,
//       cabinConfigC: serverRes.cabinConfigC,
//       cabinConfigY: serverRes.cabinConfigY,
//       arrHallFirst: serverRes.firstArrHall || serverRes.arrHallFirst,
//       arrHallLast: serverRes.lastArrHall || serverRes.arrHallLast,
//       bmaFirst: serverRes.firstBMA || serverRes.bmaFirst,
//       bmaLast: serverRes.lastBMA || serverRes.bmaLast,
//       wchcArr: serverRes.wheelChairArrivalC || serverRes.wchcArr,
//       wchsArr: serverRes.wheelChairArrivalS || serverRes.wchsArr,
//       wchrArr: serverRes.wheelChairArrivalR || serverRes.wchrArr,
//       wchcDep: serverRes.wheelChairDepartureC || serverRes.wchcDep,
//       wchsDep: serverRes.wheelChairDepartureS || serverRes.wchsDep,
//       wchrDep: serverRes.wheelChairDepartureR || serverRes.wchrDep,
//       holdConfigLDC: serverRes.ldc || serverRes.holdConfigLDC,
//       holdConfigLDP: serverRes.ldpmdp || serverRes.holdConfigLDP,
//       holdConfigMDP: serverRes.holdConfigMDP,
//       ghRemarks: serverRes.ghRemarks,
//       airlineRemarks: serverRes.airlineRemarks,
//       ghRepName: serverRes.ghRepresentativeName || serverRes.ghRepName || serverRes.ghRep,
//       airlineRepName: serverRes.airlineRepresentativeName || serverRes.airlineRepName || serverRes.airlineRep,
//       verifiedBy: serverRes.verifiedBy,
//       verifiedDate: serverRes.verifiedDate,
//       delayReasons: serverRes.delayReasons || serverRes.departureDelays?.map((d: { delay: string; reasonOfDelay?: string; reason?: string }) => ({
//         delay: d.delay,
//         reason: d.reasonOfDelay || d.reason,
//       })) || [],
//     };
//   }

//   useEffect(() => {
//     async function fetchData() {
//       setLoading(true);

//       try {
//         const response = await fetch(`${getApiBase()}/reports/flight-report/${flightSlNo}`, {
//           method: 'GET',
//           headers: {
//             'Content-Type': 'application/json',
//           },
//         });
//         console.log(response);
//         if (response.ok) {
//           const serverRes = await response.json();
//           console.log('Server response:', serverRes);
//           const mappedData = mapServerResponseToData(serverRes);
//           setData(mappedData);
//         } else {
//           console.error('Server returned status:', response.status);
//           setData({
//             serialNo: flightSlNo,
//             flightNo,
//             airlineName: airline,
//             aircraftType: aircraft,
//             staDate,
//             staTime,
//             stdDate,
//             stdTime,
//           });
//         }
//       } catch (error) {
//         console.error('Error fetching report data:', error);
//         setData({
//           serialNo: flightSlNo,
//           flightNo,
//           airlineName: airline,
//           aircraftType: aircraft,
//           staDate,
//           staTime,
//           stdDate,
//           stdTime,
//         });
//       } finally {
//         setLoading(false);
//       }
//     }

//     async function loadLogo() {
//       try {
//         const response = await fetch('/BAS.png');
//         const blob = await response.blob();
//         const reader = new FileReader();
//         reader.onloadend = () => setLogoBase64(reader.result as string);
//         reader.readAsDataURL(blob);
//       } catch {
//         setLogoBase64(null);
//       }
//     }

//     if (flightSlNo) {
//       fetchData();
//       loadLogo();
//     }
//   }, [flightSlNo, flightNo, airline, aircraft, staDate, staTime, stdDate, stdTime]);

//   const handleDownload = async () => {
//     if (!data) return;
//     setDownloading(true);

//     try {
//       const { downloadMainReportPdf } = await import('@/components/fris/flights/scheduledairlines/reportsPdf');
//       const flight = {
//         slNo: data.serialNo || '',
//         flightNo: data.flightNo || '',
//         airline: data.airlineName || '',
//         aircraft: data.aircraftType || '',
//         staDate: data.staDate || '',
//         staTime: data.staTime || '',
//         stdDate: data.stdDate || '',
//         stdTime: data.stdTime || '',
//         destination: data.routing || '',
//         flightType: '',
//         hClose: '',
//         fBag: '',
//         lBag: '',
//         exportedNAV: '',
//         rampLocked: '',
//         paxLocked: '',
//         gsdLocked: '',
//         isCancelled: false,
//       };
//       const doc = await downloadMainReportPdf(flight, null, getLoggedInUserName());
//       doc.save(`FHR_Report_${data.flightNo}_${data.staDate?.replace(/\//g, '-')}.pdf`);
//     } catch (error) {
//       console.error('Error generating PDF:', error);
//       alert('Error generating PDF. Please try again.');
//     } finally {
//       setDownloading(false);
//     }
//   };

//   if (loading) {
//     return (
//       <div className="min-h-screen bg-gray-100 flex items-center justify-center">
//         <div className="flex flex-col items-center gap-4">
//           <Loader2 className="w-12 h-12 text-emerald-500 animate-spin" />
//           <p className="text-gray-600 font-medium">Loading FHR Report...</p>
//         </div>
//       </div>
//     );
//   }

//   if (!data) {
//     return (
//       <div className="min-h-screen bg-gray-100 flex items-center justify-center">
//         <div className="flex flex-col items-center gap-4">
//           <Plane className="w-12 h-12 text-gray-400" />
//           <p className="text-gray-600 font-medium">No report data found</p>
//         </div>
//       </div>
//     );
//   }

//   const displayStaDate = formatDisplayDate(data.staDate || '');
//   const displayStdDate = formatDisplayDate(data.stdDate || '');
//   const displayAtaDate = formatDisplayDate(data.ataDate || '');
//   const displayAtdDate = formatDisplayDate(data.atdDate || '');
//   const displayStaTime = formatTime(data.staTime || '');
//   const displayStdTime = formatTime(data.stdTime || '');
//   const displayAtaTime = formatTime(data.ataTime || '');
//   const displayAtdTime = formatTime(data.atdTime || '');
//   const displayEtdTime = formatTime(data.etdTime || '');

//   return (
//     <div className="min-h-screen bg-gray-100 py-6 px-4">
//       <div className="max-w-5xl mx-auto">
//         {/* Header with Download Button */}
//         <motion.div
//           initial={{ opacity: 0, y: -20 }}
//           animate={{ opacity: 1, y: 0 }}
//           className="bg-white rounded-xl shadow-lg p-4 mb-6 flex items-center justify-between"
//         >
//           <div className="flex items-center gap-4">
//             <div className="p-3 rounded-xl bg-emerald-500 text-white">
//               <FileText className="w-6 h-6" />
//             </div>
//             <div>
//               <h1 className="text-xl font-bold text-gray-900">FHR Report</h1>
//               <p className="text-sm text-gray-500">Flight Handling Report - {data.flightNo}</p>
//             </div>
//           </div>
//           <div className="flex items-center gap-3">
//             <motion.button
//               whileHover={{ scale: 1.02 }}
//               whileTap={{ scale: 0.98 }}
//               onClick={() => window.print()}
//               className="flex items-center gap-2 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
//             >
//               <Printer className="w-4 h-4" />
//               Print
//             </motion.button>
//             <motion.button
//               whileHover={{ scale: 1.02 }}
//               whileTap={{ scale: 0.98 }}
//               onClick={handleDownload}
//               disabled={downloading}
//               className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
//             >
//               {downloading ? (
//                 <>
//                   <Loader2 className="w-4 h-4 animate-spin" />
//                   Generating...
//                 </>
//               ) : (
//                 <>
//                   <Download className="w-4 h-4" />
//                   Download PDF
//                 </>
//               )}
//             </motion.button>
//           </div>
//         </motion.div>

//         {/* Report Content - FLIGHT REPORT layout matching reference (serif, grid, alignment) */}
//         <motion.div
//           initial={{ opacity: 0, y: 20 }}
//           animate={{ opacity: 1, y: 0 }}
//           transition={{ delay: 0.1 }}
//           className="bg-white shadow overflow-hidden print:shadow-none text-gray-900"
//           id="fhr-report-content"
//           style={{ fontFamily: 'Georgia, "Times New Roman", Times, serif' }}
//         >
//           {/* Report Header: Logo | FLIGHT REPORT | Serial No, Turnaround Scheduled, MTOW, Base Flight */}
//           <div className="grid grid-cols-3 items-start border-b border-gray-300 p-4 gap-4">
//             <div className="flex items-center">
//               {logoBase64 ? (
//                 <img src={logoBase64} alt="Logo" className="h-11 object-contain" />
//               ) : (
//                 <span className="text-base font-bold text-gray-800">BIRD AIRPORT SERVICES</span>
//               )}
//             </div>
//             <h2 className="text-xl font-bold text-center">FLIGHT REPORT</h2>
//             <div className="text-right text-sm">
//               <p>Serial No: GOI / {data.serialNo}</p>
//               <p>{data.ops || 'Turnaround'} Scheduled</p>
//               <p>MTOW: {data.mtow || ''}</p>
//               <p>Base Flight {data.baseFlight || 'N'}</p>
//             </div>
//           </div>

//           {/* Airline & Terminal Code */}
//           <div className="flex justify-between items-center border-b border-gray-300 px-4 py-2"
//            style={{ fontFamily: 'Georgia, "Times New Roman", Times, serif' }}>
//             <span className="font-bold text-base">{data.airlineName}</span>
//             <span className="text-sm">Terminal Code {data.terminalCode || ''}</span>
//           </div>

//           {/* Flight Details grid - labels left, values right (reference structure) */}
//           <div className="border border-gray-400">
//             <div className="grid grid-cols-3 border-b border-gray-400 text-sm">
//               <div className="border-r border-gray-400 p-2 flex flex-col">
//                 <div className="flex justify-between"><span className="text-gray-700">Flight No</span><span className="font-semibold">{data.flightNo}</span></div>
//                 <div className="flex justify-between mt-1"><span className="text-gray-700">Aircraft Type</span><span>{data.aircraftType}</span></div>
//                 <div className="flex justify-between mt-1"><span className="text-gray-700">Aircraft Regn No.</span><span>{data.aircraftRegnNo || ''}</span></div>
//               </div>
//               <div className="border-r border-gray-400 p-2 flex flex-col">
//                 <div className="flex justify-between"><span className="text-gray-700">STA Date</span><span>{displayStaDate}</span></div>
//                 <div className="flex justify-between mt-1"><span className="text-gray-700">ATA Date</span><span>{displayAtaDate || ''}</span></div>
//                 <div className="flex justify-between mt-1"><span className="text-gray-700">Bay No.</span><span>{data.bayNo || ''}</span></div>
//                 <div className="flex justify-between mt-1"><span className="text-gray-700">STD Date</span><span>{displayStdDate}</span></div>
//                 <div className="flex justify-between mt-1"><span className="text-gray-700">ATD Date</span><span>{displayAtdDate || ''}</span></div>
//               </div>
//               <div className="p-2 flex flex-col">
//                 <div className="flex justify-between"><span className="text-gray-700">STA</span><span>{displayStaTime}</span></div>
//                 <div className="flex justify-between mt-1"><span className="text-gray-700">ATA</span><span>{displayAtaTime || ''}</span></div>
//                 <div className="flex justify-between mt-1"><span className="text-gray-700">Gate No</span><span>{data.gateNo || ''}</span></div>
//                 <div className="flex justify-between mt-1"><span className="text-gray-700">Routing</span><span>{data.routing || ''} ETD {displayEtdTime || ''}</span></div>
//                 <div className="flex justify-between mt-1"><span className="text-gray-700">STD</span><span>{displayStdTime}</span></div>
//                 <div className="flex justify-between mt-1"><span className="text-gray-700">ATD</span><span>{displayAtdTime || ''}</span></div>
//               </div>
//             </div>
//             {/* Total Delay | Status row (labels left, values right) */}
//             <div className="grid grid-cols-2 border-b border-gray-400 text-sm">
//               <div className="border-r border-gray-400 p-2 flex justify-between">
//                 <span className="text-gray-700">Total Delay</span><span className="font-semibold">{data.totalDelay || ''}</span>
//               </div>
//               <div className="p-2 flex justify-between">
//                 <span className="text-gray-700">Status:</span><span>{data.status || ''}</span>
//               </div>
//             </div>
//             {/* Delay reason box - full width below Total Delay/Status */}
//             <div className="border-b border-gray-400 min-h-[64px] p-2 text-sm">
//               <p className="text-gray-700 text-xs mb-1">Delay Reason:</p>
//               {data.delayReasons?.length
//                 ? data.delayReasons.filter((r) => r.delay || r.reason).map((r, i) => (
//                     <div key={i} className="text-xs">{[r.delay, r.reason].filter(Boolean).join(' ')}</div>
//                   ))
//                 : <span className="text-gray-500">ΓÇö</span>}
//             </div>
//             {/* IGM / EGM / ADC / FIC - one row, labels left values right */}
//             <div className="grid grid-cols-4 border-b border-gray-400 text-sm">
//               <div className="border-r border-gray-400 p-2 flex justify-between"><span className="text-gray-700">IGM No.</span><span>{data.igmNo || ''}</span></div>
//               <div className="border-r border-gray-400 p-2 flex justify-between"><span className="text-gray-700">EGM No.</span><span>{data.egmNo || ''}</span></div>
//               <div className="border-r border-gray-400 p-2 flex justify-between"><span className="text-gray-700">ADC No.</span><span>{data.adcNo || ''}</span></div>
//               <div className="p-2 flex justify-between"><span className="text-gray-700">FIC No.</span><span>{data.ficNo || ''}</span></div>
//             </div>
//           </div>

//           {/* Operational: CNT, Boarding, Pax, Bag, Cleaning - grid with labels left, values right */}
//           <div className="border border-gray-400 border-t-0">
//             <div className="grid grid-cols-10 border-b border-gray-400 text-sm">
//               {[
//                 { label: 'CNT Opened', value: data.cntOpened },
//                 { label: 'Boarding Opened', value: data.boardingOpened },
//                 { label: 'Arrival Pax', value: data.arrivalPax ?? '' },
//                 { label: 'Arrival Bag', value: data.arrivalBag ?? '' },
//                 { label: 'Cleaning From', value: data.cleaningFrom },
//                 { label: 'CNT Closed', value: data.cntClosed },
//                 { label: 'Boarding Closed', value: data.boardingClosed },
//                 { label: 'Departure Pax', value: data.departurePax ?? '' },
//                 { label: 'Departure Bag', value: data.departureBag ?? '' },
//                 { label: 'Cleaning To', value: data.cleaningTo },
//               ].map(({ label, value }, i) => (
//                 <div key={i} className={`p-2 flex flex-col ${i < 9 ? 'border-r border-gray-400' : ''}`}>
//                   <span className="text-gray-700 text-xs">{label}</span>
//                   <span className="text-right">{value ?? '-'}</span>
//                 </div>
//               ))}
//             </div>
//           </div>

//           {/* Cargo grid - same structure as reference, values right-aligned */}
//           <div className="border border-gray-400 border-t-0 text-sm">
//             <div className="grid grid-cols-11 border-b border-gray-400">
//               <div className="border-r border-gray-400 p-2 text-center text-gray-700 text-xs">Front</div>
//               <div className="border-r border-gray-400 p-2 text-center text-gray-700 text-xs">Rear</div>
//               <div className="border-r border-gray-400 p-2 text-center text-gray-700 text-xs">Bulk</div>
//               <div className="border-r border-gray-400 p-2 text-center text-gray-700 text-xs">Main</div>
//               <div className="col-span-3 border-r border-gray-400 p-2 text-gray-700 text-xs">ULD Cargo Mail</div>
//               <div className="col-span-4 p-2 text-gray-700 text-xs">Cargo Pcs In / Out, Courier In / Out</div>
//             </div>
//             <div className="grid grid-cols-11 border-b border-gray-400">
//               <div className="border-r border-gray-400 p-2 text-center">{data.frontOpen ?? ''}</div>
//               <div className="border-r border-gray-400 p-2 text-center">{data.rearOpen ?? ''}</div>
//               <div className="border-r border-gray-400 p-2 text-center">{data.bulkOpen ?? ''}</div>
//               <div className="border-r border-gray-400 p-2 text-center">{data.mainOpen ?? ''}</div>
//               <div className="border-r border-gray-400 p-2"><span className="text-gray-700 text-xs">Arrived</span><span className="float-right">{[data.uldArrived, data.cargoArrived, data.mailArrived].filter(Boolean).join(' / ') || '-'}</span></div>
//               <div className="border-r border-gray-400 p-2"><span className="text-gray-700 text-xs">Planned</span><span className="float-right">{[data.uldPlanned, data.cargoPlanned, data.mailPlanned].filter(Boolean).join(' / ') || '-'}</span></div>
//               <div className="border-r border-gray-400 p-2"><span className="text-gray-700 text-xs">Departed</span><span className="float-right">{[data.uldDeparted, data.cargoDeparted, data.mailDeparted].filter(Boolean).join(' / ') || '-'}</span></div>
//               <div className="p-2"><span className="text-gray-700 text-xs">Cargo Pcs In</span><span className="float-right">{data.cargoPcsIn ?? ''}</span></div>
//               <div className="p-2"><span className="text-gray-700 text-xs">Cargo Pcs Out</span><span className="float-right">{data.cargoPcsOut ?? ''}</span></div>
//               <div className="p-2"><span className="text-gray-700 text-xs">Courier In</span><span className="float-right">{data.courierIn ?? ''}</span></div>
//               <div className="p-2"><span className="text-gray-700 text-xs">Courier Out</span><span className="float-right">{data.courierOut ?? ''}</span></div>
//             </div>
//             <div className="grid grid-cols-11 border-b border-gray-400">
//               <div className="border-r border-gray-400 p-2 text-center">{data.frontClose ?? ''}</div>
//               <div className="border-r border-gray-400 p-2 text-center">{data.rearClose ?? ''}</div>
//               <div className="border-r border-gray-400 p-2 text-center">{data.bulkClose ?? ''}</div>
//               <div className="border-r border-gray-400 p-2 text-center">{data.mainClose ?? ''}</div>
//               <div className="col-span-3 border-r border-gray-400 p-2"><span className="text-gray-700 text-xs">Last activity time on Hold</span><span className="float-right">{data.lastActivityTimeOnHold || ''}</span></div>
//               <div className="col-span-4 p-2"><span className="text-gray-700 text-xs">Transit Cargo</span><span className="float-right">{data.transitCargo || ''}</span></div>
//             </div>
//           </div>

//           {/* Cabin / Hold Config | Arr Hall / BMA | Wheel Chair - grid */}
//           <div className="border border-gray-400 border-t-0">
//             <div className="grid grid-cols-12 text-sm border-b border-gray-400">
//               <div className="col-span-4 border-r border-gray-400 p-2">
//                 <p className="text-gray-700 text-xs">Cabin Config</p>
//                 <p className="text-right">F {data.cabinConfigF ?? ''} C {data.cabinConfigC ?? ''} Y {data.cabinConfigY ?? ''}</p>
//                 <p className="text-gray-700 text-xs mt-1">LDC LDPMDP Last</p>
//                 <p className="text-gray-700 text-xs">Hold Config</p>
//                 <p className="text-right">{data.holdConfigLDC ?? ''} {data.holdConfigLDP ?? ''} {data.holdConfigMDP ?? ''}</p>
//               </div>
//               <div className="col-span-2 border-r border-gray-400 p-2">
//                 <p className="text-gray-700 text-xs">Arr Hall</p>
//                 <p className="text-right">First {data.arrHallFirst ?? ''} Last {data.arrHallLast ?? ''}</p>
//                 <p className="text-gray-700 text-xs mt-1">BMA</p>
//                 <p className="text-right">{data.bmaFirst ?? ''} {data.bmaLast ?? ''}</p>
//               </div>
//               <div className="col-span-6 p-2">
//                 <p className="text-gray-700 text-xs">WCH(C) WCH(S) WCH(R)</p>
//                 <p className="text-gray-700 text-xs">Wheel Chair(Arr.)</p>
//                 <p className="text-right">{[data.wchcArr, data.wchsArr, data.wchrArr].join(' ') || '-'}</p>
//                 <p className="text-gray-700 text-xs mt-1">Wheel Chair(Dep.)</p>
//                 <p className="text-right">{[data.wchcDep, data.wchsDep, data.wchrDep].join(' ') || '-'}</p>
//               </div>
//             </div>
//           </div>

//           {/* Remarks - bordered boxes */}
//           <div className="border border-gray-400 border-t-0 grid grid-cols-2">
//             <div className="border-r border-gray-400 p-2">
//               <p className="text-sm font-medium text-gray-700 mb-1">GH Remarks:-</p>
//               <div className="min-h-[64px] border border-gray-400 p-2 text-sm text-gray-800">{data.ghRemarks || ''}</div>
//             </div>
//             <div className="p-2">
//               <p className="text-sm font-medium text-gray-700 mb-1">Airline Remarks:-</p>
//               <div className="min-h-[64px] border border-gray-400 p-2 text-sm text-gray-800">{data.airlineRemarks || ''}</div>
//             </div>
//           </div>

//           {/* Signatures */}
//           <div className="border border-gray-400 border-t-0 grid grid-cols-2 p-4">
//             <div className="border-r border-gray-400 pr-4 flex flex-col items-center">
//               <div className="w-24 h-12 border border-gray-400 mb-1" />
//               <p className="text-sm font-medium">Signature</p>
//               <p className="text-sm text-gray-700">GH Representative: {data.ghRepName || ''}</p>
//             </div>
//             <div className="pl-4 flex flex-col items-center">
//               <div className="w-24 h-12 border border-gray-400 mb-1" />
//               <p className="text-sm font-medium">Signature</p>
//               <p className="text-sm text-gray-700">Airline Representative: {data.airlineRepName || ''}</p>
//             </div>
//           </div>

//           {/* Footer */}
//           <div className="border border-gray-400 border-t-0 py-3 text-center text-sm text-gray-700">
//             Printed On : Date/Time : {new Date().toLocaleString()}
//           </div>
//         </motion.div>
//       </div>
//     </div>
//   );
// }

// export default function FHRReportPage() {
//   return (
//     <Suspense fallback={
//       <div className="min-h-screen bg-gray-100 flex items-center justify-center">
//         <div className="flex flex-col items-center gap-4">
//           <Loader2 className="w-12 h-12 text-emerald-500 animate-spin" />
//           <p className="text-gray-600 font-medium">Loading FHR Report...</p>
//         </div>
//       </div>
//     }>
//       <FHRReportContent />
//     </Suspense>
//   );
// }

'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Download, Loader2, Plane, FileText, Printer } from 'lucide-react';
import { motion } from 'framer-motion';
import { frisFetch } from '@/lib/fris-auth-fetch';
import { clearFrisSession } from '@/lib/fris-session';
import {
  adcFicForFhrReport,
  formatNsAirlineWithOperator,
  formatGroundTimeBetween,
  formatIposTimeFromFirstLast,
  resolveCleaningDurationForReport,
  resolveFhrTotalDelay,
  formatReportSerialNoLabel,
} from '@/components/fris/flights/scheduledairlines/reportPdfUtils';
import { getApiBase, type ResolvedFhrSignatures } from '@/lib/api';
import { resolveSignaturesForPdf, formatSignedAt } from '@/components/fris/flights/scheduledairlines/signatures/signaturePdf';
import { getSessionStationLogoPath } from '@/lib/station-company-logo';
import { normalizeMainDetailsData, type MainDetailsData } from '@/utils/dataProcessor';
import { flightNoFromMainDetails } from '@/components/fris/flights/scheduledairlines/flightNoDisplay';
import {
  FHR_EMPTY_DASH,
  fhrDisplayValue,
  isFhrFieldEmpty,
} from '@/components/fris/flights/scheduledairlines/fhrEmptyDisplay';
import { cn } from '@/lib/utils';

/** Empty report values → centered `-`. */
function FhrVal({ value, className = '' }: { value: unknown; className?: string }) {
  const empty = isFhrFieldEmpty(value);
  return (
    <span className={empty ? `inline-block min-w-[1.25rem] text-center ${className}`.trim() : className}>
      {fhrDisplayValue(value)}
    </span>
  );
}

/** Preview-only: label and value sit on one row; values line up in a column. */
function FhrKvStack({ children }: { children: React.ReactNode }) {
  return <div className="fhr-kv-stack">{children}</div>;
}

function FhrKv({
  label,
  value,
  nowrap,
}: {
  label: string;
  value: unknown;
  nowrap?: boolean;
}) {
  return (
    <>
      <span className="font-bold whitespace-nowrap">{label} :</span>
      <span className={nowrap ? 'whitespace-nowrap min-w-0 overflow-hidden text-ellipsis' : 'min-w-0'}>
        <FhrVal value={value} />
      </span>
    </>
  );
}

interface FlightReportData {
  serialNo?: string;
  airlineName?: string;
  flightNo?: string;
  aircraftType?: string;
  aircraftRegnNo?: string;
  terminalCode?: string;
  staDate?: string;
  staTime?: string;
  stdDate?: string;
  stdTime?: string;
  ataDate?: string;
  ataTime?: string;
  atdDate?: string;
  atdTime?: string;
  etdTime?: string;
  bayNo?: string;
  gateNo?: string;
  routing?: string;
  ops?: string;
  mtow?: string;
  baseFlight?: string;
  totalDelay?: string;
  arrivalDelay?: string;
  ActualDelay?: string;
  departureDelay?: string;
  arrivalDelays?: Array<{ delay?: string; Delay?: string; reasonOfDelay?: string; ReasonofDelay?: string }>;
  departureDelays?: Array<{ delay?: string; Delay?: string; reasonOfDelay?: string; ReasonofDelay?: string }>;
  /** Type of handling for FHR header (server: `typeOfHandling` from main `TypeofHandling`). */
  typeOfHandling?: string;
  status?: string;
  igmNo?: string;
  egmNo?: string;
  adcNo?: string;
  ficNo?: string;
  iposDate?: string;
  iposTime?: string;
  cntOpened?: string;
  cntClosed?: string;
  boardingOpened?: string;
  boardingClosed?: string;
  arrivalPax?: number;
  departurePax?: number;
  arrivalBag?: number;
  departureBag?: number;
  cleaningFrom?: string;
  cleaningTo?: string;
  cleaningDuration?: string;
  frontOpen?: string;
  frontClose?: string;
  rearOpen?: string;
  rearClose?: string;
  bulkOpen?: string;
  bulkClose?: string;
  mainOpen?: string;
  mainClose?: string;
  lastActivityTimeOnHold?: string;
  transitCargo?: string;
  uldArrived?: number;
  uldPlanned?: number;
  uldDeparted?: number;
  cargoArrived?: number;
  cargoPlanned?: number;
  cargoDeparted?: number;
  mailArrived?: number;
  mailPlanned?: number;
  mailDeparted?: number;
  cargoPcsIn?: number | string;
  cargoPcsOut?: number | string;
  courierIn?: number | string;
  courierOut?: number | string;
  cabinConfigF?: number;
  cabinConfigC?: number;
  cabinConfigY?: number;
  arrHallFirst?: string;
  arrHallLast?: string;
  bmaFirst?: string;
  bmaLast?: string;
  wchcArr?: number;
  wchsArr?: number;
  wchrArr?: number;
  wchcDep?: number;
  wchsDep?: number;
  wchrDep?: number;
  holdConfigLDC?: number;
  holdConfigLDP?: number;
  holdConfigMDP?: number;
  ghRemarks?: string;
  airlineRemarks?: string;
  ghRepName?: string;
  airlineRepName?: string;
  verifiedBy?: string;
  verifiedDate?: string;
  delayReasons?: Array<{ delay: string; reason: string }>;
}

type ReportAccessState =
  | 'checking'
  | 'authorized'
  | 'anonymous'
  | 'unauthorized'
  | 'forbidden';

/** Format date as dd/mm/yyyy for flight details. */
function formatDisplayDate(dateStr: string): string {
  if (!dateStr?.trim()) return '';
  const parts = dateStr.trim().split(/[-/]/).map((p) => p.trim());
  if (parts.length !== 3) return dateStr;
  let day: string;
  let month: string;
  let year: string;
  const first = parts[0];
  const second = parts[1];
  const third = parts[2];
  if (first.length === 4 && /^19\d{2}|20\d{2}$/.test(first)) {
    year = first;
    month = second.padStart(2, '0');
    day = third.padStart(2, '0');
  } else {
    day = first.padStart(2, '0');
    month = second.padStart(2, '0');
    year = third.length === 2 ? `20${third}` : third.padStart(4, '0');
  }
  return `${day}/${month}/${year}`;
}

function formatTime(timeStr: string): string {
  if (!timeStr?.trim()) return '';
  const trimmed = timeStr.trim();
  // Combined datetime in a time field — show clock only.
  const spaceIdx = trimmed.search(/\s+/);
  const clock =
    spaceIdx > 0 && /\d{1,2}[/-]\d{1,2}/.test(trimmed.slice(0, spaceIdx))
      ? trimmed.slice(spaceIdx + 1).trim()
      : trimmed.includes('T')
        ? trimmed.slice(trimmed.indexOf('T') + 1)
        : trimmed;
  const parts = clock.split(':');
  if (parts.length >= 2) {
    return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}`;
  }
  return clock;
}

/** IPOS date must not show stray Yes/Non-date tokens from bad legacy data. */
function formatIposDateLabel(raw: unknown): string {
  const s = String(raw ?? '').trim();
  if (!s || /^(yes|no)$/i.test(s)) return '';
  return formatDisplayDate(s);
}

/** When IPOS time is empty but date holds "dd/mm/yyyy HH:mm", pull the clock. */
function iposTimeFromDateOrTime(dateRaw: unknown, timeRaw: unknown): string {
  const time = String(timeRaw ?? '').trim();
  if (time) return formatTime(time);
  const date = String(dateRaw ?? '').trim();
  if (!date) return '';
  if (/\d{1,2}:\d{2}/.test(date)) return formatTime(date);
  return '';
}

function composeDateTimeForReport(
  dateValue: unknown,
  timeValue: unknown,
  combinedPrimary?: unknown,
  combinedFallback?: unknown,
): string {
  const date = String(dateValue ?? '').trim();
  const time = String(timeValue ?? '').trim();
  if (date && time) return `${date} ${time}`;
  const combined1 = String(combinedPrimary ?? '').trim();
  if (combined1) return combined1;
  const combined2 = String(combinedFallback ?? '').trim();
  if (combined2) return combined2;
  return time || date;
}

/** Split hold open/close combined "date time" into separate cells (matches FHR PDF). */
function splitHoldDateTime(s: string | undefined): { date: string; time: string } {
  if (!s?.trim()) return { date: '', time: '' };
  const t = s.trim();
  if (t.includes('T')) {
    const idx = t.indexOf('T');
    return {
      date: formatDisplayDate(t.slice(0, idx)),
      time: formatTime(t.slice(idx + 1)),
    };
  }
  const spaceIdx = t.indexOf(' ');
  if (spaceIdx > 0) {
    return {
      date: formatDisplayDate(t.slice(0, spaceIdx)),
      time: formatTime(t.slice(spaceIdx + 1)),
    };
  }
  if ((t.includes('/') || t.includes('-')) && !t.includes(':')) {
    return { date: formatDisplayDate(t), time: '' };
  }
  return { date: '', time: formatTime(t) };
}

/** FHR Cleaning From / To: clock time only on screen (full composed value used for duration). */
function cleaningTimeOnlyFromComposed(full: string): string {
  if (!full?.trim()) return '';
  const t = full.trim();
  if (t.includes('T')) {
    const timePart = t.slice(t.indexOf('T') + 1);
    return formatTime(timePart);
  }
  const spaceIdx = t.indexOf(' ');
  if (spaceIdx > 0) return formatTime(t.slice(spaceIdx + 1));
  if ((t.includes('/') || t.includes('-')) && !t.includes(':')) return '';
  return formatTime(t);
}

function getLoggedInUserName(): string {
  if (typeof window === 'undefined') return 'User';
  try {
    const userStr = localStorage.getItem('user') || sessionStorage.getItem('user');
    if (userStr) {
      const user = JSON.parse(userStr);
      return user?.name || user?.username || user?.email || 'User';
    }
  } catch {
    // ignore
  }
  return 'User';
}

function FHRReportContent() {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<FlightReportData | null>(null);
  const [mainDetails, setMainDetails] = useState<MainDetailsData | null>(null);
  const [logoBase64, setLogoBase64] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [accessState, setAccessState] = useState<ReportAccessState>('checking');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [signatures, setSignatures] = useState<ResolvedFhrSignatures | null>(null);
  /** NS-only header fields (Performa / Booking) — mirrors FHR PDF `nonScheduledHeader`. */
  const [nsHeader, setNsHeader] = useState<{
    challanNo: string;
    bookingNo: string;
    operation: string;
    mtow: string;
    operator: string;
  } | null>(null);

  const flightSlNo = searchParams.get('flightSlNo') || '';
  /** Table instance serial when it differs from Mongo/ns-raw serial (`flightSlNo`). */
  const instanceSlNo = searchParams.get('instanceSlNo') || '';
  /** Same value as Scheduled Airlines ΓÇ£Sl.NoΓÇ¥ column (legacy serial when linked). */
  const tableSerial = searchParams.get('tableSerial') || '';
  const flightNoFromQuery = searchParams.get('flightNo') || '';
  const airlineFromQuery = searchParams.get('airline') || '';
  const aircraftFromQuery = searchParams.get('aircraft') || '';
  const staDateFromQuery = searchParams.get('staDate') || '';
  const staTimeFromQuery = searchParams.get('staTime') || '';
  const stdDateFromQuery = searchParams.get('stdDate') || '';
  const stdTimeFromQuery = searchParams.get('stdTime') || '';
  const routingFromQuery = searchParams.get('routing') || '';
  /** Non-Scheduled Airlines opens this same preview with `source=non-scheduled`. */
  const isNonScheduledSource =
    String(searchParams.get('source') || '').trim().toLowerCase() === 'non-scheduled';
  const challanNoFromQuery = searchParams.get('challanNo') || '';
  const bookingNoFromQuery = searchParams.get('bookingNo') || '';
  const operatorFromQuery = searchParams.get('operator') || '';

  const reportHeaderSerial = String(
    tableSerial.trim() || flightSlNo.trim() || instanceSlNo.trim() || '',
  ).trim();

  useEffect(() => {
    setAccessState('authorized');
  }, []);

  // Reusable representative signatures resolved from the repository (best-effort).
  // Mirrors the downloaded PDF so the on-screen preview shows the same images.
  useEffect(() => {
    const key = reportHeaderSerial;
    if (!key) return;
    let mounted = true;
    void (async () => {
      const resolved = await resolveSignaturesForPdf(key, 'fhr');
      if (mounted) setSignatures(resolved);
    })();
    return () => {
      mounted = false;
    };
  }, [reportHeaderSerial]);

  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      (accessState !== 'anonymous' && accessState !== 'unauthorized')
    ) {
      return;
    }

    if (accessState === 'unauthorized') {
      clearFrisSession();
    }

    window.location.replace('/login');
  }, [accessState]);

  function mapServerResponseToData(serverRes: any): FlightReportData {
    if (!serverRes) return { serialNo: reportHeaderSerial || flightSlNo };

    const cleaningFromFull =
      String(serverRes.cleaningFromTime ?? '').trim() ||
      composeDateTimeForReport(
        serverRes.cleaningStartedDate,
        serverRes.cleaningStartedTime,
        serverRes.cleaningFrom,
        serverRes.cleaningFromTime,
      );
    const cleaningToFull =
      String(serverRes.cleaningToTime ?? '').trim() ||
      composeDateTimeForReport(
        serverRes.cleaningClosedDate,
        serverRes.cleaningClosedTime,
        serverRes.cleaningTo,
        serverRes.cleaningToTime,
      );
    const cleaningFromFallback = String(serverRes.cleaningFromTime ?? '').trim();
    const cleaningToFallback = String(serverRes.cleaningToTime ?? '').trim();
    const cleaningFrom = cleaningTimeOnlyFromComposed(
      cleaningFromFull || cleaningFromFallback,
    );
    const cleaningTo = cleaningTimeOnlyFromComposed(
      cleaningToFull || cleaningToFallback,
    );

    return {
      serialNo: String(
        reportHeaderSerial || serverRes.serialNo || serverRes.slNo || flightSlNo || '',
      ),
      airlineName: serverRes.airlineName || serverRes.airline || airlineFromQuery,
      flightNo: serverRes.flightNo || serverRes.flightCode || flightNoFromQuery,
      aircraftType: serverRes.aircraftType || serverRes.aircraft || aircraftFromQuery,
      aircraftRegnNo:
        serverRes.aircraftRegnNo ||
        serverRes.regnNo ||
        serverRes.regNo ||
        serverRes.registrationNo,
      terminalCode: serverRes.terminalCode,
      // STA/STD: server schedule resolution, then scheduled-table query params.
      staDate: serverRes.staDate || staDateFromQuery,
      staTime: serverRes.staTime || staTimeFromQuery,
      stdDate: serverRes.stdDate || stdDateFromQuery,
      stdTime: serverRes.stdTime || stdTimeFromQuery,
      ataDate: serverRes.ataDate,
      ataTime: serverRes.ataTime,
      atdDate: serverRes.atdDate,
      atdTime: serverRes.atdTime,
      etdTime: serverRes.etdTime,
      bayNo: serverRes.bayNo,
      gateNo: serverRes.gateNo,
      routing: serverRes.routing || serverRes.route || routingFromQuery,
      ops: serverRes.ops,
      mtow: serverRes.mtow,
      baseFlight: serverRes.baseFlight || (serverRes.stationBaseNightHalt ? 'Y' : 'N'),
      totalDelay: resolveFhrTotalDelay({
        arrivalDelay: serverRes.arrivalDelay,
        actualDelay: serverRes.ActualDelay,
        departureDelay: serverRes.departureDelay,
        arrivalDelays: serverRes.arrivalDelays,
        departureDelays: serverRes.departureDelays,
        fallback: serverRes.totalDelay,
      }),
      arrivalDelay: serverRes.arrivalDelay,
      ActualDelay: serverRes.ActualDelay,
      departureDelay: serverRes.departureDelay,
      arrivalDelays: serverRes.arrivalDelays,
      departureDelays: serverRes.departureDelays,
      typeOfHandling:
        serverRes.typeOfHandling ??
        serverRes.TypeofHandling ??
        '',
      status: serverRes.status || serverRes.departureStatus,
      igmNo: serverRes.igmNo ?? serverRes.igm,
      egmNo: serverRes.egmNo ?? serverRes.egm,
      adcNo: serverRes.adcNo ?? serverRes.adc,
      ficNo: serverRes.ficNo ?? serverRes.fic,
      iposDate: serverRes.iposDate,
      iposTime: serverRes.iposTime,
      cntOpened: serverRes.cntOpenedTime || serverRes.cntOpened,
      cntClosed: serverRes.cntClosedTime || serverRes.cntClosed,
      boardingOpened: serverRes.boardingOpenedTime || serverRes.boardingOpened,
      boardingClosed: serverRes.boardingClosedTime || serverRes.boardingClosed,
      arrivalPax: serverRes.arrivalPax,
      departurePax: serverRes.departurePax,
      arrivalBag: serverRes.arrivalBag,
      departureBag: serverRes.departureBag,
      cleaningFrom,
      cleaningTo,
      cleaningDuration: resolveCleaningDurationForReport(
        serverRes.cleaningDuration ?? serverRes.cleaning_duration,
        cleaningFromFull || cleaningFromFallback,
        cleaningToFull || cleaningToFallback,
      ),
      frontOpen: serverRes.cargoCompartmentFrontOpen || serverRes.frontOpen,
      frontClose: serverRes.cargoCompartmentFrontClose || serverRes.frontClose,
      rearOpen: serverRes.cargoCompartmentRearOpen || serverRes.rearOpen,
      rearClose: serverRes.cargoCompartmentRearClose || serverRes.rearClose,
      bulkOpen: serverRes.cargoCompartmentBulkOpen || serverRes.bulkOpen,
      bulkClose: serverRes.cargoCompartmentBulkClose || serverRes.bulkClose,
      mainOpen: serverRes.cargoCompartmentMainOpen || serverRes.mainOpen,
      mainClose: serverRes.cargoCompartmentMainClose || serverRes.mainClose,
      lastActivityTimeOnHold: serverRes.lastActivityTimeOnHold,
      transitCargo: serverRes.transitCargo,
      uldArrived: serverRes.uldCargoArrived ?? serverRes.uldArrived,
      uldPlanned: serverRes.uldCargoPlanned ?? serverRes.uldPlanned,
      uldDeparted: serverRes.uldCargoDeparted ?? serverRes.uldDeparted,
      cargoArrived: serverRes.cargoArrived,
      cargoPlanned: serverRes.cargoPlanned,
      cargoDeparted: serverRes.cargoDeparted,
      mailArrived: serverRes.mailArrived,
      mailPlanned: serverRes.mailPlanned,
      mailDeparted: serverRes.mailDeparted,
      cargoPcsIn: serverRes.cargoPcsIn ?? serverRes.cgoPcsIn,
      cargoPcsOut: serverRes.cargoPcsOut ?? serverRes.cgoPcsOut,
      courierIn: serverRes.courierIn ?? serverRes.courierPcsIn,
      courierOut: serverRes.courierOut ?? serverRes.courierPcsOut,
      cabinConfigF: serverRes.cabinConfigF,
      cabinConfigC: serverRes.cabinConfigC,
      cabinConfigY: serverRes.cabinConfigY,
      arrHallFirst: serverRes.firstArrHall || serverRes.arrHallFirst,
      arrHallLast: serverRes.lastArrHall || serverRes.arrHallLast,
      bmaFirst: serverRes.firstBMA || serverRes.bmaFirst,
      bmaLast: serverRes.lastBMA || serverRes.bmaLast,
      wchcArr: serverRes.wheelChairArrivalC ?? serverRes.wchcArr,
      wchsArr: serverRes.wheelChairArrivalS ?? serverRes.wchsArr,
      wchrArr: serverRes.wheelChairArrivalR ?? serverRes.wchrArr,
      wchcDep: serverRes.wheelChairDepartureC ?? serverRes.wchcDep,
      wchsDep: serverRes.wheelChairDepartureS ?? serverRes.wchsDep,
      wchrDep: serverRes.wheelChairDepartureR ?? serverRes.wchrDep,
      holdConfigLDC: serverRes.ldc ?? serverRes.holdConfigLDC,
      holdConfigLDP: serverRes.ldp ?? serverRes.ldpmdp ?? serverRes.holdConfigLDP,
      holdConfigMDP: serverRes.mdp ?? serverRes.holdConfigMDP,
      ghRemarks: serverRes.ghRemarks,
      airlineRemarks: serverRes.airlineRemarks,
      ghRepName: serverRes.ghRepresentativeName || serverRes.ghRepName || serverRes.ghRep,
      airlineRepName: serverRes.airlineRepresentativeName || serverRes.airlineRepName || serverRes.airlineRep,
      verifiedBy: serverRes.verifiedBy,
      verifiedDate: serverRes.verifiedDate,
      delayReasons: (serverRes.delayReasons || serverRes.departureDelays || []).map((d: { delay?: string; reasonOfDelay?: string; reason?: string }) => ({
        delay: d.delay || '',
        reason: d.reasonOfDelay ?? d.reason ?? '',
      })),
    };
  }

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setLoadError(null);

      try {
        const raw = [flightSlNo, instanceSlNo, tableSerial].map((s) => String(s ?? '').trim()).filter(Boolean);
        const expanded: string[] = [];
        for (const r of raw) {
          expanded.push(r, r.replace(/^FL-/i, ''), r.replace(/[^0-9]/g, ''));
        }
        const serialCandidates = Array.from(new Set(expanded.filter(Boolean)));

        let serverRes: Record<string, unknown> | null = null;
        let sawUnauthorized = false;
        let sawForbidden = false;
        for (const serial of serialCandidates) {
          const response = await frisFetch(
            `${getApiBase()}/reports/flight-report/${encodeURIComponent(serial)}`,
            {
              method: 'GET',
              headers: {
                'Content-Type': 'application/json',
              },
            },
          );
          if (response.ok) {
            serverRes = (await response.json()) as Record<string, unknown>;
            break;
          }
          if (response.status === 401) {
            sawUnauthorized = true;
            continue;
          }
          if (response.status === 403) {
            sawForbidden = true;
            continue;
          }
          if (process.env.NODE_ENV === 'development' && response.status >= 500) {
            console.warn('Flight report API:', response.status, serial);
          }
        }

        let mapped = serverRes ? mapServerResponseToData(serverRes) : null;

        // NS Open-form collections often have fuller data than thin flight-report API.
        if (isNonScheduledSource && serialCandidates.length > 0) {
          try {
            const { fetchNsFormReportPayload } = await import(
              '@/components/fris/flights/non-scheduled-airlines/nonScheduledReportDownloads'
            );
            const {
              readNsReportFlightPrefill,
            } = await import(
              '@/components/fris/flights/non-scheduled-airlines/nonScheduledReportPreview'
            );
            const { reportOverrides, main: nsMain, reportHeaderExtras } =
              await fetchNsFormReportPayload(serialCandidates[0]);
            const storedFlight = readNsReportFlightPrefill(
              reportHeaderSerial || flightSlNo,
            );
            const challan =
              String(reportHeaderExtras.challanNo ?? '').trim() ||
              String(nsMain?.challanNo ?? '').trim() ||
              String(storedFlight?.challanNo ?? '').trim() ||
              String(challanNoFromQuery ?? '').trim();
            const booking =
              String(reportHeaderExtras.bookingNo ?? '').trim() ||
              String(nsMain?.bookingNo ?? '').trim() ||
              String(storedFlight?.bookingNo ?? '').trim() ||
              String(bookingNoFromQuery ?? '').trim();
            setNsHeader({
              challanNo: challan,
              bookingNo: booking,
              operation: String(reportHeaderExtras.operation || 'Turnaround').trim(),
              mtow: String(
                reportHeaderExtras.mtow ?? nsMain?.mtow ?? '',
              ).trim(),
              operator:
                String(reportHeaderExtras.operator ?? '').trim() ||
                String(nsMain?.operator ?? '').trim() ||
                String(storedFlight?.operator ?? '').trim() ||
                String(operatorFromQuery ?? '').trim(),
            });
            const base: FlightReportData = mapped ?? {
              serialNo: reportHeaderSerial || flightSlNo,
              airlineName: airlineFromQuery,
              flightNo: flightNoFromQuery,
              aircraftType: aircraftFromQuery,
              staDate: staDateFromQuery,
              staTime: staTimeFromQuery,
              stdDate: stdDateFromQuery,
              stdTime: stdTimeFromQuery,
              routing: routingFromQuery,
            };
            mapped = {
              ...base,
              ...Object.fromEntries(
                Object.entries(reportOverrides).filter(
                  ([, v]) => v !== undefined && v !== null && String(v).trim() !== '',
                ),
              ),
              serialNo: base.serialNo || reportHeaderSerial || flightSlNo,
              airlineName:
                String(reportOverrides.airlineName ?? '').trim() ||
                base.airlineName ||
                airlineFromQuery,
              flightNo:
                String(reportOverrides.flightNo ?? '').trim() ||
                base.flightNo ||
                flightNoFromQuery,
              aircraftType:
                String(reportOverrides.aircraftType ?? '').trim() ||
                base.aircraftType ||
                aircraftFromQuery,
              staDate: base.staDate || staDateFromQuery,
              staTime: base.staTime || staTimeFromQuery,
              stdDate: base.stdDate || stdDateFromQuery,
              stdTime: base.stdTime || stdTimeFromQuery,
              routing: base.routing || routingFromQuery,
              mtow:
                String(reportOverrides.mtow ?? '').trim() ||
                base.mtow ||
                String(reportHeaderExtras.mtow ?? '').trim(),
            };
            if (nsMain) {
              setMainDetails((prev) => prev ?? nsMain);
            }
          } catch (nsErr) {
            if (process.env.NODE_ENV === 'development') {
              console.warn('NS form report hydrate failed:', nsErr);
            }
            // Still show query/session Performa + Booking when form hydrate fails.
            setNsHeader({
              challanNo: String(challanNoFromQuery ?? '').trim(),
              bookingNo: String(bookingNoFromQuery ?? '').trim(),
              operation: 'Turnaround',
              mtow: '',
              operator: String(operatorFromQuery ?? '').trim(),
            });
          }
        } else if (!isNonScheduledSource) {
          setNsHeader(null);
        }

        if (mapped) {
          setData(mapped);
          setAccessState('authorized');
        } else if (sawUnauthorized) {
          setAccessState('unauthorized');
          setData(null);
        } else if (sawForbidden) {
          setAccessState('forbidden');
          setData(null);
        } else {
          setData(null);
        }
      } catch (error) {
        console.error('Error fetching report data:', error);
        setData(null);
        setLoadError('Unable to load the protected report data.');
      } finally {
        setLoading(false);
      }
    }

    async function loadLogo() {
      try {
        const response = await fetch(getSessionStationLogoPath());
        const blob = await response.blob();
        const reader = new FileReader();
        reader.onloadend = () => setLogoBase64(reader.result as string);
        reader.readAsDataURL(blob);
      } catch {
        setLogoBase64(null);
      }
    }

    async function fetchMainDetailsFromFhr() {
      try {
        const rawCandidates = [
          String(flightSlNo || '').trim(),
          String(instanceSlNo || '').trim(),
          String(tableSerial || '').trim(),
          String(flightSlNo || '').trim().replace(/^FL-/i, ''),
          String(flightSlNo || '').trim().replace(/[^0-9]/g, ''),
          String(instanceSlNo || '').trim().replace(/^FL-/i, ''),
          String(instanceSlNo || '').trim().replace(/[^0-9]/g, ''),
          String(tableSerial || '').trim().replace(/^FL-/i, ''),
          String(tableSerial || '').trim().replace(/[^0-9]/g, ''),
        ].filter(Boolean);
        const serialCandidates = Array.from(new Set(rawCandidates));
        const base = getApiBase().replace(/\/$/, '');

        for (const serial of serialCandidates) {
          const res = await frisFetch(
            `${base}/fhr-collection/flight/${encodeURIComponent(serial)}`,
          );
          if (res.status === 401) {
            setAccessState('unauthorized');
            return;
          }
          if (res.status === 403) {
            setAccessState('forbidden');
            return;
          }
          if (!res.ok) continue;
          const doc = (await res.json()) as {
            SerialNo?: number;
            flightSerialNumber?: number;
            mainDetails?: Record<string, unknown> | null;
          };
          const md = doc?.mainDetails;
          if (md && typeof md === 'object') {
            const sn = Number(doc.SerialNo ?? doc.flightSerialNumber ?? serial);
            const normalized = normalizeMainDetailsData(md);
            const mdRec = md as Record<string, unknown>;
            setMainDetails({
              ...(normalized ?? (md as unknown as MainDetailsData)),
              flightSerialNumber: Number.isFinite(sn)
                ? sn
                : Number(String(serial).replace(/\D/g, '')) || 0,
              airlineName:
                normalized?.airlineName ||
                String(md.airlineName ?? md.Airline ?? '').trim() ||
                airlineFromQuery,
              flightCode:
                normalized?.flightCode ||
                String(md.flightCode ?? '').trim() ||
                flightNoFromQuery,
              typeOfHandling: String(
                mdRec.typeOfHandling ?? mdRec.TypeofHandling ?? '',
              ).trim(),
            });
            return;
          }
        }
        setMainDetails(null);
      } catch {
        setMainDetails(null);
      }
    }

    if (accessState !== 'authorized') {
      return;
    }

    if (flightSlNo || instanceSlNo || tableSerial) {
      loadLogo();
      fetchData();
      fetchMainDetailsFromFhr();
    } else {
      setData(null);
      setMainDetails(null);
      setLoading(false);
    }
  }, [
    accessState,
    flightSlNo,
    instanceSlNo,
    tableSerial,
    flightNoFromQuery,
    airlineFromQuery,
    aircraftFromQuery,
    staDateFromQuery,
    staTimeFromQuery,
    stdDateFromQuery,
    stdTimeFromQuery,
    routingFromQuery,
    isNonScheduledSource,
    challanNoFromQuery,
    bookingNoFromQuery,
    operatorFromQuery,
  ]);

  const handleDownload = async () => {
    if (!data) return;
    setDownloading(true);

    try {
      if (isNonScheduledSource) {
        const {
          downloadNonScheduledReport,
        } = await import(
          '@/components/fris/flights/non-scheduled-airlines/nonScheduledReportDownloads'
        );
        const {
          readNsReportFlightPrefill,
          nsFlightFromSearchParams,
        } = await import(
          '@/components/fris/flights/non-scheduled-airlines/nonScheduledReportPreview'
        );
        const stored = readNsReportFlightPrefill(reportHeaderSerial || flightSlNo);
        const nsFlight =
          stored ??
          nsFlightFromSearchParams(
            new URLSearchParams(typeof window !== 'undefined' ? window.location.search : ''),
          );
        await downloadNonScheduledReport(nsFlight, 'fhr');
        return;
      }

      const { downloadMainReportPdf } = await import('@/components/fris/flights/scheduledairlines/reportsPdf');
      const flight = {
        // Keep serial aligned with scheduled airlines table row.
        slNo: reportHeaderSerial || flightSlNo || data.serialNo || '',
        flightNo: data.flightNo || '',
        airline: data.airlineName || '',
        aircraft: data.aircraftType || '',
        // Keep PDF STA/STD aligned with scheduled table row.
        staDate: staDateFromQuery || data.staDate || '',
        staTime: staTimeFromQuery || data.staTime || '',
        stdDate: stdDateFromQuery || data.stdDate || '',
        stdTime: stdTimeFromQuery || data.stdTime || '',
        destination: data.routing || '',
        flightType: '',
        typeOfHandling: data.typeOfHandling || '',
        hClose: '',
        fBag: '',
        lBag: '',
        exportedNAV: '',
        rampLocked: '',
        paxLocked: '',
        gsdLocked: '',
        isCancelled: false,
      };
      const doc = await downloadMainReportPdf(
        flight,
        mainDetails ?? undefined,
        getLoggedInUserName(),
        {
          cleaningFrom: data.cleaningFrom,
          cleaningTo: data.cleaningTo,
        },
      );
      doc.save(`FHR_Report_${data.flightNo}_${data.staDate?.replace(/\//g, '-')}.pdf`);
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Error generating PDF. Please try again.');
    } finally {
      setDownloading(false);
    }
  };

  // Match jsPDF `times` (Times-Roman) used by fhrReportPdf.ts
  const REPORT_SERIF_FONT = '"Times New Roman", Times, serif';
  const reportFontBase = { fontFamily: REPORT_SERIF_FONT };
  if (loading || accessState === 'checking') {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center" style={reportFontBase}>
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-12 h-12 text-emerald-500 animate-spin" />
          <p className="text-gray-600 font-medium">Loading FHR Report...</p>
        </div>
      </div>
    );
  }

  if (accessState === 'anonymous' || accessState === 'unauthorized') {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center" style={reportFontBase}>
        <div className="flex flex-col items-center gap-4">
          <Plane className="w-12 h-12 text-gray-400" />
          <p className="text-gray-600 font-medium">
            Authentication is required. Redirecting to login...
          </p>
        </div>
      </div>
    );
  }

  if (accessState === 'forbidden') {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center" style={reportFontBase}>
        <div className="flex flex-col items-center gap-4">
          <Plane className="w-12 h-12 text-red-400" />
          <p className="text-gray-700 font-medium">
            You do not have permission to view this report.
          </p>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center" style={reportFontBase}>
        <div className="flex flex-col items-center gap-4">
          <Plane className="w-12 h-12 text-gray-400" />
          <p className="text-gray-700 font-medium">{loadError}</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center" style={reportFontBase}>
        <div className="flex flex-col items-center gap-4">
          <Plane className="w-12 h-12 text-gray-400" />
          <p className="text-gray-600 font-medium">No report data found</p>
        </div>
      </div>
    );
  }

  // Always prefer Main Details for actual movement timings.
  const ataDateRaw = mainDetails?.ataDate || data.ataDate || '';
  const atdDateRaw = mainDetails?.atdDate || data.atdDate || '';
  const ataTimeRaw = mainDetails?.ataTime || data.ataTime || '';
  const atdTimeRaw = mainDetails?.atdTime || data.atdTime || '';
  const etdTimeRaw = mainDetails?.etdTime || data.etdTime || '';

  const displayStaDate = formatDisplayDate(data.staDate || '');
  const displayStdDate = formatDisplayDate(data.stdDate || '');
  const displayAtaDate = formatDisplayDate(ataDateRaw);
  const displayAtdDate = formatDisplayDate(atdDateRaw);
  const displayStaTime = formatTime(data.staTime || '');
  const displayStdTime = formatTime(data.stdTime || '');
  const displayAtaTime = formatTime(ataTimeRaw);
  const displayAtdTime = formatTime(atdTimeRaw);
  const displayEtdTime = formatTime(etdTimeRaw);
  // SGT = STD − STA; AGT = ATD − ATA (same as PDF)
  const sgtDisplay = formatGroundTimeBetween(
    data.staDate,
    data.staTime,
    data.stdDate,
    data.stdTime,
  );
  const agtDisplay = formatGroundTimeBetween(
    ataDateRaw,
    ataTimeRaw,
    atdDateRaw,
    atdTimeRaw,
  );

  const frontOpenDt = splitHoldDateTime(data.frontOpen);
  const rearOpenDt = splitHoldDateTime(data.rearOpen);
  const bulkOpenDt = splitHoldDateTime(data.bulkOpen);
  const mainOpenDt = splitHoldDateTime(data.mainOpen);
  const frontCloseDt = splitHoldDateTime(data.frontClose);
  const rearCloseDt = splitHoldDateTime(data.rearClose);
  const bulkCloseDt = splitHoldDateTime(data.bulkClose);
  const mainCloseDt = splitHoldDateTime(data.mainClose);

  // Prefer main details for status, total delay, and delay reasons (arrival + departure from main details)
  const statusDisplay = mainDetails?.departureStatus != null && mainDetails.departureStatus !== ''
    ? mainDetails.departureStatus
    : (data.status || '');
  const totalDelayDisplay = resolveFhrTotalDelay({
    arrivalDelay: mainDetails?.arrivalDelay || data.arrivalDelay,
    actualDelay:
      (mainDetails as { ActualDelay?: string } | null | undefined)?.ActualDelay ||
      data.ActualDelay,
    departureDelay: mainDetails?.departureDelay || data.departureDelay,
    arrivalDelays:
      mainDetails?.arrivalDelays?.length ? mainDetails.arrivalDelays : data.arrivalDelays,
    departureDelays:
      mainDetails?.departureDelays?.length
        ? mainDetails.departureDelays
        : data.departureDelays,
    fallback: data.totalDelay,
  });
  const delayReasonsFromMain: Array<{ delay: string; reason: string }> = [];
  if (mainDetails?.arrivalDelays?.length) {
    mainDetails.arrivalDelays.forEach((e) => {
      const reason = (e.reasonOfDelay ?? '').trim();
      if (reason) delayReasonsFromMain.push({ delay: e.delay || '', reason });
    });
  }
  if (mainDetails?.departureDelays?.length) {
    mainDetails.departureDelays.forEach((e) => {
      const reason = (e.reasonOfDelay ?? '').trim();
      if (reason) delayReasonsFromMain.push({ delay: e.delay || '', reason });
    });
  }
  const delayReasonsForBox = delayReasonsFromMain.length > 0
    ? delayReasonsFromMain
    : (data.delayReasons || []).filter((r) => (r.reason || '').trim());

  const typeOfHandlingDisplay =
    String(
      mainDetails?.typeOfHandling ??
        (mainDetails as unknown as { TypeofHandling?: string })?.TypeofHandling ??
        '',
    ).trim() ||
    String(data.typeOfHandling ?? '').trim();
  const opsDisplay = mainDetails?.ops?.trim() ? mainDetails.ops : (data.ops || 'Turnaround');
  const flightKindRaw = String(
    typeOfHandlingDisplay || data.typeOfHandling || '',
  )
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  const flightKindDisplay =
    flightKindRaw.includes('non-scheduled') ||
    flightKindRaw.includes('non scheduled') ||
    flightKindRaw.includes('non-skd') ||
    flightKindRaw.includes('nonskd')
      ? 'Non Scheduled'
      : flightKindRaw.includes('ramp')
        ? 'Ramp'
        : 'Scheduled';
  const opsAndFlightKind = `${opsDisplay} ${flightKindDisplay}`.trim();
  const baseFlightDisplay =
    mainDetails?.stationBaseNightHalt != null
      ? mainDetails.stationBaseNightHalt
        ? 'Y'
        : 'N'
      : (data.baseFlight || 'N');
  const airlineNameDisplay = mainDetails?.airlineName?.trim()
    ? mainDetails.airlineName
    : (data.airlineName || '');
  const airlineOperatorDisplay = isNonScheduledSource
    ? formatNsAirlineWithOperator(
        airlineNameDisplay || airlineFromQuery,
        nsHeader?.operator ||
          operatorFromQuery ||
          mainDetails?.operator ||
          '',
      )
    : airlineNameDisplay;
  const terminalCodeDisplay = mainDetails?.terminalCode?.trim()
    ? mainDetails.terminalCode
    : (data.terminalCode || '');
  const flightNoDisplay = flightNoFromMainDetails(
    mainDetails,
    data.flightNo || '',
  );
  const aircraftTypeDisplay = mainDetails?.aircraftType?.trim()
    ? mainDetails.aircraftType
    : (data.aircraftType || '');
  const mainDetailsRegnNo = String(
    mainDetails?.regnNo ||
    (mainDetails as any)?.regNo ||
    (mainDetails as any)?.registrationNo ||
    (mainDetails as any)?.aircraftRegnNo ||
    '',
  ).trim();
  const aircraftRegnNoDisplay = mainDetailsRegnNo || (data.aircraftRegnNo || '');
  const routingDisplay = mainDetails?.route?.trim() ? mainDetails.route : (data.routing || '');
  // IPOS Date = ATA Date; IPOS Time = Arr Belt Last − First (mm:ss)
  const iposDateDisplay = displayAtaDate;
  const iposTimeDisplay = formatIposTimeFromFirstLast(data.arrHallFirst, data.arrHallLast);
  const { adcNo: adcNoFhrDisplay, ficNo: ficNoFhrDisplay } = adcFicForFhrReport(
    data.adcNo,
    data.ficNo,
  );
  const ghRepDisplay = mainDetails?.ghRep?.trim() ? mainDetails.ghRep : (data.ghRepName || '');
  const airlineRepDisplay = mainDetails?.airlineRep?.trim()
    ? mainDetails.airlineRep
    : (data.airlineRepName || '');

  // PDF-matching font: Times (serif), sizes: 14pt title, 12pt airline, 10pt body, 9pt table labels/values
  const reportFont = { fontFamily: REPORT_SERIF_FONT };
  const font9 = { ...reportFont, fontSize: '9pt' };
  const font10 = { ...reportFont, fontSize: '10pt' };
  const font12 = { ...reportFont, fontSize: '12pt' };
  const font14 = { ...reportFont, fontSize: '14pt' };

  const verifiedByDisplay =
    (data.verifiedBy || getLoggedInUserName() || '').trim();
  const verifiedDateDisplay = data.verifiedDate
    ? formatDisplayDate(data.verifiedDate)
    : new Date().toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });

  return (
    <div className="min-h-screen bg-slate-200 py-8 px-4">
      <div className="max-w-5xl mx-auto">
        {/* Header with Download Button */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-xl shadow-lg p-4 mb-6 flex items-center justify-between print:hidden"
        >
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-emerald-500 text-white">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">FHR Report</h1>
              <p className="text-sm text-gray-500">Flight Handling Report - {data.flightNo}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => window.print()}
              className="flex items-center gap-2 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
            >
              <Printer className="w-4 h-4" />
              Print
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleDownload}
              disabled={downloading}
              className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {downloading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  Download PDF
                </>
              )}
            </motion.button>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white shadow-2xl rounded-sm border border-gray-300 print:shadow-none text-gray-900 fris-report-preview max-w-[210mm] mx-auto p-6 sm:p-8"
          id="fhr-report-content"
          style={reportFont}
        >
          {/* Header: Logo | (title scheduled only) | Serial / Performa / Booking */}
          <div
            className="items-start border-b border-gray-300 p-4 gap-4"
            style={{
              display: 'grid',
              gridTemplateColumns: isNonScheduledSource ? '1fr 1fr' : '1fr 1fr 1fr',
            }}
          >
            <div className="flex items-center">
              {logoBase64 ? (
                <img src={logoBase64} alt="Logo" className="h-11 object-contain" />
              ) : (
                <span className="font-bold text-gray-800" style={font12}>BIRD AIRPORT SERVICES</span>
              )}
            </div>
            {!isNonScheduledSource ? (
              <h2 className="font-bold text-center" style={font14}>FLIGHT REPORT</h2>
            ) : null}
            <div
              className={cn(
                'text-left',
                isNonScheduledSource && 'justify-self-end text-right',
              )}
              style={font10}
            >
              <p className="whitespace-nowrap">
                {formatReportSerialNoLabel(reportHeaderSerial || data.serialNo || flightSlNo)}
              </p>
              {isNonScheduledSource ? (
                <>
                  <FhrKvStack>
                    <FhrKv
                      label="Performa No"
                      nowrap
                      value={
                        nsHeader?.challanNo ||
                        challanNoFromQuery ||
                        mainDetails?.challanNo ||
                        ''
                      }
                    />
                    <FhrKv
                      label="Booking No"
                      nowrap
                      value={
                        nsHeader?.bookingNo ||
                        bookingNoFromQuery ||
                        mainDetails?.bookingNo ||
                        ''
                      }
                    />
                  </FhrKvStack>
                  <p className="whitespace-nowrap">
                    {`${nsHeader?.operation || opsDisplay}   Non-Scheduled`.trim()}
                  </p>
                  <FhrKvStack>
                    <FhrKv
                      label="MTOW"
                      nowrap
                      value={nsHeader?.mtow || data.mtow || mainDetails?.mtow}
                    />
                  </FhrKvStack>
                </>
              ) : (
                <>
                  <p>{opsAndFlightKind}</p>
                  <FhrKvStack>
                    <FhrKv label="MTOW" nowrap value={data.mtow} />
                    <FhrKv label="Base Flight" nowrap value={baseFlightDisplay} />
                  </FhrKvStack>
                </>
              )}
            </div>
          </div>

          {/* Airline (12pt bold) & Terminal Code : (10pt right) - single row */}
          <div className="flex justify-between items-center border-b border-gray-300 px-4 py-1">
            <span className="font-bold whitespace-nowrap" style={font12}>
              <FhrVal value={airlineOperatorDisplay} />
            </span>
            <span className="fhr-kv-inline" style={font10}>
              <span className="font-bold whitespace-nowrap">Terminal Code :</span>
              <FhrVal value={terminalCodeDisplay} />
            </span>
          </div>

          {/* Main flight details - ONE row, 3 columns (25% | 35% | 40%), label : value, same as PDF */}
          <div className="border border-gray-400">
            <div
              className="items-start border-b border-gray-400"
              style={{
                display: 'grid',
                gridTemplateColumns: '25% 35% 40%',
                ...font9,
              }}
            >
              <div className="border-r border-gray-400 report-cell report-row-tight">
                <FhrKvStack>
                  <FhrKv
                    label="Flight No"
                    nowrap
                    value={String(flightNoDisplay ?? '')
                      .replace(/\s*\/\s*/g, '/')
                      .replace(/\s+/g, '')}
                  />
                  <FhrKv label="Aircraft Type" value={aircraftTypeDisplay} />
                  <FhrKv label="Aircraft Regn No." value={aircraftRegnNoDisplay} />
                </FhrKvStack>
              </div>
              <div
                className="border-r border-gray-400 report-cell report-row-tight"
                style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: '8px' }}
              >
                <FhrKvStack>
                  <FhrKv label="STA Date" nowrap value={displayStaDate} />
                  <FhrKv label="ATA Date" nowrap value={displayAtaDate} />
                  <FhrKv label="Bay No." value={data.bayNo} />
                </FhrKvStack>
                <FhrKvStack>
                  <FhrKv label="STA" nowrap value={displayStaTime} />
                  <FhrKv label="ATA" nowrap value={displayAtaTime} />
                  <FhrKv label="Gate No" value={data.gateNo} />
                </FhrKvStack>
              </div>
              <div
                className="report-cell report-row-tight"
                style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: '8px' }}
              >
                <FhrKvStack>
                  <FhrKv label="STD Date" nowrap value={displayStdDate} />
                  <FhrKv label="ATD Date" nowrap value={displayAtdDate} />
                  <FhrKv label="Routing" value={routingDisplay} />
                </FhrKvStack>
                <FhrKvStack>
                  <FhrKv label="STD" nowrap value={displayStdTime} />
                  <FhrKv label="ATD" nowrap value={displayAtdTime} />
                  <FhrKv label="ETD" nowrap value={displayEtdTime} />
                </FhrKvStack>
              </div>
            </div>
            {/* Delay Reason, Total Delay, Status, SGT, AGT — same row as PDF */}
            <div
              className="items-start border-b border-gray-400 report-cell"
              style={{
                display: 'grid',
                gridTemplateColumns: '0.9fr 1.1fr 1.2fr 0.85fr 0.85fr',
                ...font9,
              }}
            >
              <div className="border-r border-gray-400 pr-2">
                <span className="font-bold">Delay Reason :</span>
              </div>
              <div className="border-r border-gray-400 pr-2">
                <FhrKvStack>
                  <FhrKv label="Total Delay" nowrap value={totalDelayDisplay} />
                </FhrKvStack>
              </div>
              <div className="border-r border-gray-400 pr-2 pl-2">
                <FhrKvStack>
                  <FhrKv label="Status" nowrap value={statusDisplay} />
                </FhrKvStack>
              </div>
              <div className="border-r border-gray-400 pr-2 pl-2">
                <FhrKvStack>
                  <FhrKv label="SGT" nowrap value={sgtDisplay} />
                </FhrKvStack>
              </div>
              <div className="pl-2">
                <FhrKvStack>
                  <FhrKv label="AGT" nowrap value={agtDisplay} />
                </FhrKvStack>
              </div>
            </div>
            {/* Delay Reason details (full width) - from main details (arrival + departure) when available */}
            <div className="border-b border-gray-400 min-h-[36px] report-cell" style={font10}>
              <div>
                {delayReasonsForBox.length
                  ? delayReasonsForBox.map((r, i) => (
                      <div key={i} style={font9}>{[r.delay, r.reason].filter(Boolean).join(' - ')}</div>
                    ))
                  : (
                    <div style={font9}>{FHR_EMPTY_DASH}</div>
                  )}
              </div>
            </div>
            {/* IGM / EGM / ADC / FIC / IPOS - 5 columns, IPOS has date and time in single column at end */}
            <div
              className="items-start border-b border-gray-400"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(5, 1fr)',
                ...font9,
              }}
            >
              <div className="border-r border-gray-400 report-cell">
                <FhrKvStack>
                  <FhrKv label="IGM No." nowrap value={data.igmNo} />
                </FhrKvStack>
              </div>
              <div className="border-r border-gray-400 report-cell">
                <FhrKvStack>
                  <FhrKv label="EGM No." nowrap value={data.egmNo} />
                </FhrKvStack>
              </div>
              <div className="border-r border-gray-400 report-cell">
                <FhrKvStack>
                  <FhrKv label="ADC No." nowrap value={adcNoFhrDisplay} />
                </FhrKvStack>
              </div>
              <div className="border-r border-gray-400 report-cell">
                <FhrKvStack>
                  <FhrKv label="FIC No." nowrap value={ficNoFhrDisplay} />
                </FhrKvStack>
              </div>
              <div className="report-cell report-row-tight">
                <FhrKvStack>
                  <FhrKv label="IPOS Date" nowrap value={iposDateDisplay} />
                  <FhrKv label="IPOS Time" nowrap value={iposTimeDisplay} />
                </FhrKvStack>
              </div>
            </div>
          </div>

          {/* Counter / Boarding / Pax / Bag / Cleaning - 5 columns (labels match Terminal Details) */}
          <div
            className="border border-gray-400 border-t-0 items-start"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(5, 1fr)',
              ...font9,
            }}
          >
            <div className="border-r border-gray-400 report-cell report-row-tight">
              <FhrKvStack>
                <FhrKv label="Counter Open" nowrap value={data.cntOpened} />
                <FhrKv label="Counter Close" nowrap value={data.cntClosed} />
              </FhrKvStack>
            </div>
            <div className="border-r border-gray-400 report-cell report-row-tight">
              <FhrKvStack>
                <FhrKv label="Boarding Open" nowrap value={data.boardingOpened} />
                <FhrKv label="Boarding Close" nowrap value={data.boardingClosed} />
              </FhrKvStack>
            </div>
            <div className="border-r border-gray-400 report-cell report-row-tight">
              <FhrKvStack>
                <FhrKv label="Arrival Pax" nowrap value={data.arrivalPax} />
                <FhrKv label="Departure Pax" nowrap value={data.departurePax} />
              </FhrKvStack>
            </div>
            <div className="border-r border-gray-400 report-cell report-row-tight">
              <FhrKvStack>
                <FhrKv label="Arrival Bag" nowrap value={data.arrivalBag} />
                <FhrKv label="Departure Bag" nowrap value={data.departureBag} />
              </FhrKvStack>
            </div>
            <div className="report-cell report-row-tight">
              <FhrKvStack>
                <FhrKv label="Cleaning From" nowrap value={data.cleaningFrom} />
                <FhrKv label="Cleaning To" nowrap value={data.cleaningTo} />
                <span
                  id="fhr-cleaning-duration"
                  data-fhr-field="cleaningDuration"
                  className="fhr-field-cleaning-duration font-bold whitespace-nowrap"
                  aria-label="Cleaning duration"
                >
                  Cleaning Duration :
                </span>
                <span className="whitespace-nowrap min-w-0">
                  <FhrVal
                    value={resolveCleaningDurationForReport(
                      data.cleaningDuration,
                      data.cleaningFrom,
                      data.cleaningTo,
                    )}
                  />
                </span>
              </FhrKvStack>
            </div>
          </div>

          {/* Hold / ULD / Cargo - same structure as PDF: Open row, Close row, Arrived/Planned/Departed, Last activity / Transit Cargo */}
          <div className="border border-gray-400 border-t-0" style={font10}>
            <table className="w-full border-collapse" style={font9}>
              <thead>
                <tr className="border-b border-gray-400">
                  <th className="border-r border-gray-400 report-cell w-12 font-bold text-center align-top">Open<br />/ Close</th>
                  <th className="border-r border-gray-400 p-1 font-bold text-center">Front</th>
                  <th className="border-r border-gray-400 p-1 font-bold text-center">Rear</th>
                  <th className="border-r border-gray-400 p-1 font-bold text-center">Bulk</th>
                  <th className="border-r border-gray-400 p-1 font-bold text-center">Main</th>
                  <th className="border-r border-gray-400 p-1 font-normal text-left">Arrived / Planned / Departed</th>
                  <th className="border-r border-gray-400 p-1 font-bold text-center">ULD</th>
                  <th className="border-r border-gray-400 p-1 font-bold text-center">Cargo(kg)</th>
                  <th className="border-r border-gray-400 p-1 font-bold text-center">Mail(kg)</th>
                  <th className="border-r border-gray-400 p-1 font-normal text-left">Cargo pcs / Courier</th>
                  <th className="p-1 font-normal text-center">Values</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-gray-400">
                  <td className="border-r border-gray-400 p-1 text-center align-top font-normal">Open</td>
                  <td className="border-r border-gray-400 p-1 text-center">
                    <span className="block"><FhrVal value={frontOpenDt.date} /></span>
                  </td>
                  <td className="border-r border-gray-400 p-1 text-center">
                    <span className="block"><FhrVal value={rearOpenDt.date} /></span>
                  </td>
                  <td className="border-r border-gray-400 p-1 text-center">
                    <span className="block"><FhrVal value={bulkOpenDt.date} /></span>
                  </td>
                  <td className="border-r border-gray-400 p-1 text-center">
                    <span className="block"><FhrVal value={mainOpenDt.date} /></span>
                  </td>
                  <td className="border-r border-gray-400 p-1">Arrived</td>
                  <td className="border-r border-gray-400 p-1 text-center"><FhrVal value={data.uldArrived} /></td>
                  <td className="border-r border-gray-400 p-1 text-center"><FhrVal value={data.cargoArrived} /></td>
                  <td className="border-r border-gray-400 p-1 text-center"><FhrVal value={data.mailArrived} /></td>
                  <td className="border-r border-gray-400 p-1">Cargo pcs in</td>
                  <td className="p-1 text-center"><FhrVal value={data.cargoPcsIn} /></td>
                </tr>
                <tr className="border-b border-gray-400">
                  <td className="border-r border-gray-400 p-1 text-center align-top">&nbsp;</td>
                  <td className="border-r border-gray-400 p-1 text-center">
                    <span className="block"><FhrVal value={frontOpenDt.time} /></span>
                  </td>
                  <td className="border-r border-gray-400 p-1 text-center">
                    <span className="block"><FhrVal value={rearOpenDt.time} /></span>
                  </td>
                  <td className="border-r border-gray-400 p-1 text-center">
                    <span className="block"><FhrVal value={bulkOpenDt.time} /></span>
                  </td>
                  <td className="border-r border-gray-400 p-1 text-center">
                    <span className="block"><FhrVal value={mainOpenDt.time} /></span>
                  </td>
                  <td className="border-r border-gray-400 p-1">Planned</td>
                  <td className="border-r border-gray-400 p-1 text-center"><FhrVal value={data.uldPlanned} /></td>
                  <td className="border-r border-gray-400 p-1 text-center"><FhrVal value={data.cargoPlanned} /></td>
                  <td className="border-r border-gray-400 p-1 text-center"><FhrVal value={data.mailPlanned} /></td>
                  <td className="border-r border-gray-400 p-1">Cargo pcs out</td>
                  <td className="p-1 text-center"><FhrVal value={data.cargoPcsOut} /></td>
                </tr>
                <tr className="border-b border-gray-400">
                  <td className="border-r border-gray-400 p-1 text-center align-top font-normal">Close</td>
                  <td className="border-r border-gray-400 p-1 text-center">
                    <span className="block"><FhrVal value={frontCloseDt.date} /></span>
                  </td>
                  <td className="border-r border-gray-400 p-1 text-center">
                    <span className="block"><FhrVal value={rearCloseDt.date} /></span>
                  </td>
                  <td className="border-r border-gray-400 p-1 text-center">
                    <span className="block"><FhrVal value={bulkCloseDt.date} /></span>
                  </td>
                  <td className="border-r border-gray-400 p-1 text-center">
                    <span className="block"><FhrVal value={mainCloseDt.date} /></span>
                  </td>
                  <td className="border-r border-gray-400 p-1">Departed</td>
                  <td className="border-r border-gray-400 p-1 text-center"><FhrVal value={data.uldDeparted} /></td>
                  <td className="border-r border-gray-400 p-1 text-center"><FhrVal value={data.cargoDeparted} /></td>
                  <td className="border-r border-gray-400 p-1 text-center"><FhrVal value={data.mailDeparted} /></td>
                  <td className="border-r border-gray-400 p-1">Courier in</td>
                  <td className="p-1 text-center"><FhrVal value={data.courierIn} /></td>
                </tr>
                <tr className="border-b border-gray-400">
                  <td className="border-r border-gray-400 p-1 text-center align-top">&nbsp;</td>
                  <td className="border-r border-gray-400 p-1 text-center">
                    <span className="block"><FhrVal value={frontCloseDt.time} /></span>
                  </td>
                  <td className="border-r border-gray-400 p-1 text-center">
                    <span className="block"><FhrVal value={rearCloseDt.time} /></span>
                  </td>
                  <td className="border-r border-gray-400 p-1 text-center">
                    <span className="block"><FhrVal value={bulkCloseDt.time} /></span>
                  </td>
                  <td className="border-r border-gray-400 p-1 text-center">
                    <span className="block"><FhrVal value={mainCloseDt.time} /></span>
                  </td>
                  <td className="border-r border-gray-400 p-1">&nbsp;</td>
                  <td className="border-r border-gray-400 p-1 text-center">{FHR_EMPTY_DASH}</td>
                  <td className="border-r border-gray-400 p-1 text-center">{FHR_EMPTY_DASH}</td>
                  <td className="border-r border-gray-400 p-1 text-center">{FHR_EMPTY_DASH}</td>
                  <td className="border-r border-gray-400 p-1">Courier out</td>
                  <td className="p-1 text-center"><FhrVal value={data.courierOut} /></td>
                </tr>
                <tr className="border-b border-gray-400">
                  <td colSpan={5} className="border-r border-gray-400 p-1">
                    Last Activity time on Hold :{' '}
                    <FhrVal value={(data.lastActivityTimeOnHold || '').trim().replace(/\s+/, '   ')} />
                  </td>
                  <td colSpan={6} className="p-1">
                    Transit Cargo : <FhrVal value={data.transitCargo} />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Cabin Config / Arr Belt / BMA / WCH - same as PDF */}
          <div
            className="border border-gray-400 border-t-0 items-start"
            style={{
              display: 'grid',
              gridTemplateColumns: '33.33% 25% 41.67%',
              ...font10,
            }}
          >
            <div className="border-r border-gray-400 report-cell">
              <p className="font-bold" style={font9}>Cabin Config</p>
              <p className="text-center">
                F <FhrVal value={data.cabinConfigF} />{' '}
                C <FhrVal value={data.cabinConfigC} />{' '}
                Y <FhrVal value={data.cabinConfigY} />
              </p>
              <p className="font-bold mt-0.5" style={font9}>Hold Config</p>
              <p className="text-center">
                LDC <FhrVal value={data.holdConfigLDC} />{' '}
                LDP <FhrVal value={data.holdConfigLDP} />{' '}
                MDP <FhrVal value={data.holdConfigMDP} />
              </p>
            </div>
            <div className="border-r border-gray-400 report-cell">
              <p className="font-bold" style={font9}>Arr Belt</p>
              <p className="text-center">
                First <FhrVal value={data.arrHallFirst} />{' '}
                Last <FhrVal value={data.arrHallLast} />
              </p>
              <p className="font-bold mt-0.5" style={font9}>BMA</p>
              <p className="text-center">
                First <FhrVal value={data.bmaFirst} />{' '}
                Last <FhrVal value={data.bmaLast} />
              </p>
            </div>
            <div className="report-cell">
              <p className="font-bold" style={font9}>WCH(C)  WCH(S)  WCH(R)</p>
              <p style={font9}>Wheel Chair (Arr.)</p>
              <p className="text-center">
                <FhrVal value={data.wchcArr} />{'  '}
                <FhrVal value={data.wchsArr} />{'  '}
                <FhrVal value={data.wchrArr} />
              </p>
              <p style={font9}>Wheel Chair (Dep.)</p>
              <p className="text-center">
                <FhrVal value={data.wchcDep} />{'  '}
                <FhrVal value={data.wchsDep} />{'  '}
                <FhrVal value={data.wchrDep} />
              </p>
            </div>
          </div>

          {/* Remarks - reduced box size to match PDF */}
          <div
            className="border border-gray-400 border-t-0 items-start"
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
            }}
          >
            <div className="border-r border-gray-400 report-cell" style={font10}>
              <p className="font-bold text-gray-700">GH Remarks :-</p>
              <div className="min-h-[36px] border border-gray-400 report-cell text-gray-800" style={font9}>
                {isFhrFieldEmpty(data.ghRemarks) ? (
                  <span>{FHR_EMPTY_DASH}</span>
                ) : (
                  <span className="block">{data.ghRemarks}</span>
                )}
              </div>
            </div>
            <div className="report-cell" style={font10}>
              <p className="font-bold text-gray-700">Airline Remarks :-</p>
              <div className="min-h-[36px] border border-gray-400 report-cell text-gray-800" style={font9}>
                {isFhrFieldEmpty(data.airlineRemarks) ? (
                  <span>{FHR_EMPTY_DASH}</span>
                ) : (
                  <span className="block">{data.airlineRemarks}</span>
                )}
              </div>
            </div>
          </div>

          {/* Signatures */}
          <div
            className="border border-gray-400 border-t-0 items-start report-cell"
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              ...font10,
            }}
          >
            <div className="border-r border-gray-400 pr-2 flex flex-col items-start">
              <div className="w-24 h-12 border border-gray-400 mb-1 flex items-center justify-center overflow-hidden bg-white">
                {signatures?.gh.signatureUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={signatures.gh.signatureUrl}
                    alt="GH Representative signature"
                    className="max-h-full max-w-full object-contain"
                  />
                ) : null}
              </div>
              <p className="font-bold">Signature</p>
              <p className="text-gray-700">GH Representative : <FhrVal value={ghRepDisplay} /></p>
              {formatSignedAt(signatures?.gh.signedAt) ? (
                <p className="text-[10px] text-gray-500">
                  Signed: {formatSignedAt(signatures?.gh.signedAt)}
                </p>
              ) : null}
            </div>
            <div className="pl-2 flex flex-col items-start">
              <div className="w-24 h-12 border border-gray-400 mb-1 flex items-center justify-center overflow-hidden bg-white">
                {signatures?.airline.signatureUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={signatures.airline.signatureUrl}
                    alt="Airline Representative signature"
                    className="max-h-full max-w-full object-contain"
                  />
                ) : null}
              </div>
              <p className="font-bold">Signature</p>
              <p className="text-gray-700">Airline Representative : <FhrVal value={airlineRepDisplay} /></p>
              {formatSignedAt(signatures?.airline.signedAt) ? (
                <p className="text-[10px] text-gray-500">
                  Signed: {formatSignedAt(signatures?.airline.signedAt)}
                </p>
              ) : null}
            </div>
          </div>

          {/* Footer - same as PDF */}
          {verifiedByDisplay ? (
            <div className="border border-gray-400 border-t-0 report-cell text-gray-700" style={font10}>
              Verified by : {verifiedByDisplay} - {verifiedDateDisplay}
            </div>
          ) : null}
          <div className="border border-gray-400 border-t-0 py-2 text-center text-gray-700" style={font10}>
            Printed On : Date/Time : {new Date().toLocaleString()}
          </div>
        </motion.div>
      </div>
    </div>
  );
}

export default function FHRReportPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-100 flex items-center justify-center" style={{ fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif' }}>
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-12 h-12 text-emerald-500 animate-spin" />
          <p className="text-gray-600 font-medium">Loading FHR Report...</p>
        </div>
      </div>
    }>
      <FHRReportContent />
    </Suspense>
  );
}
