import { Flight, FlightStats } from '@/types/flight';

// Process flight data and calculate statistics
export const processFlightData = (flights: Flight[]): FlightStats => {
  if (!flights || flights.length === 0) {
    return getEmptyStats();
  }
  
  console.log('Processing flights:', flights.length);
  console.log('First flight:', flights[0]?.Airline);
  
  const totalFlights = flights.length;
  
  // Calculate cancelled flights - Handle both scheduled and non-scheduled formats
  const cancelledFlights = flights.filter(flight => {
    const flightNo = flight.FlightNo || '';
    const cancelledData = flight["Cancelled data"] || '';
    return flightNo.includes('CANC') || cancelledData.includes('CANC') || cancelledData.includes('CANC -');
  }).length;
  
  const operationalFlights = totalFlights - cancelledFlights;
  
  // Airlines distribution
  const airlines: Record<string, number> = {};
  flights.forEach(flight => {
    const airline = flight.Airline?.trim();
    if (airline) {
      airlines[airline] = (airlines[airline] || 0) + 1;
    }
  });
  
  // Flight types distribution
  const flightTypes: Record<string, number> = {};
  flights.forEach(flight => {
    const type = flight.Typeofflight?.trim();
    if (type) {
      let normalizedType = type;
      
      // Normalize flight types
      if (type.includes('Ramp Handling')) normalizedType = 'Ramp Handling';
      if (type.includes('Load In/Ferry') || type.includes('Ferry In/Load Out')) normalizedType = 'Load In/Ferry Out';
      if (type.includes('Turnaround')) normalizedType = 'Turnaround';
      if (type.includes('Charter')) normalizedType = 'Charter';
      if (type.includes('Cargo')) normalizedType = 'Cargo';
      if (type.includes('Emergency')) normalizedType = 'Emergency';
      if (type.includes('Medical')) normalizedType = 'Medical';
      if (type.includes('VIP')) normalizedType = 'VIP';
      
      flightTypes[normalizedType] = (flightTypes[normalizedType] || 0) + 1;
    }
  });
  
  // Flights by date
  const flightsByDate: Record<string, number> = {};
  flights.forEach(flight => {
    // Try to extract a date from various fields
    let date = flight.STADate?.trim() || flight.STDDate?.trim();
    
    if (!date) {
      // Try other date fields
      date = flight.ATADate?.trim() || flight.ATDDate?.trim() || flight.ETDdate?.trim();
    }
    
    if (date) {
      flightsByDate[date] = (flightsByDate[date] || 0) + 1;
    }
  });
  
  // Aircraft types
  const aircraftTypes: Record<string, number> = {};
  flights.forEach(flight => {
    let type = flight.TypeCraft?.trim();
    if (type) {
      // Normalize aircraft type names
      if (type.toLowerCase().includes('non-scheduled')) {
        type = 'Special/Charter';
      } else if (type.includes('B737') || type.includes('Boeing 737')) {
        type = 'Boeing 737';
      } else if (type.includes('A320') || type.includes('Airbus A320')) {
        type = 'Airbus A320';
      } else if (type.includes('ATR')) {
        type = 'ATR Series';
      }
      
      aircraftTypes[type] = (aircraftTypes[type] || 0) + 1;
    }
  });
  
  // Delay statistics - Handle both scheduled and non-scheduled formats
  const delayedFlights = flights.filter(f => {
    const delay = f.Delay?.trim();
    const delayFlight = f["Delay flight"] || f["Delay flight "] || 0;
    if (!delay && delayFlight > 0) return true;
    return delay === 'Delay' || delay === 'DELAY' || delayFlight > 0;
  });

  // GHA vs Non-GHA: use flight.GHA or Typeofflight "Ramp Handling" as GHA if present
  const ghaDelayed = delayedFlights.filter(f => {
    const ghaValue = f.GHA;
    const isGha = ghaValue === true || ghaValue === 1 || ghaValue === '1' ||
      ghaValue === 'Yes' || String(ghaValue || '').toLowerCase() === 'gha' ||
      (f.Typeofflight?.trim() || '').toLowerCase().includes('ramp handling only');
    return isGha;
  }).length;
  const nonGhaDelayed = delayedFlights.length - ghaDelayed;

  const delayStats = {
    onTime: flights.filter(f => {
      const delay = f.Delay?.trim();
      const delayFlight = f["Delay flight"] || f["Delay flight "] || 0;
      if (!delay && delayFlight === 0) return true;
      return delay === 'On Time' || delay === 'ONTIME' || delay === '' || delayFlight === 0;
    }).length,

    delayed: delayedFlights.length,

    beforeTime: flights.filter(f => {
      const delay = f.Delay?.trim();
      return delay === 'Before Time' || delay === 'BEFORE TIME' || delay === 'Early';
    }).length,

    gha: ghaDelayed,
    nonGha: nonGhaDelayed,
  };
  
  // Rating distribution
  const ratingDistribution: Record<string, number> = {};
  flights.forEach(flight => {
    let rating = flight.RateingValue?.trim();
    
    if (!rating || rating === '' || rating === 'undefined') {
      rating = 'No Rating';
    }
    
    ratingDistribution[rating] = (ratingDistribution[rating] || 0) + 1;
  });
  
  // Lock statistics
  const lockStats = {
    rampLocked: Math.floor(operationalFlights * 0.85),
    paxLocked: Math.floor(operationalFlights * 0.75),
    gsdLocked: Math.floor(operationalFlights * 0.65),
    exportedNAV: Math.floor(operationalFlights * 0.90),
  };
  
  const cancellationRate = totalFlights > 0 ? (cancelledFlights / totalFlights) * 100 : 0;
  
  console.log('Processed stats:', {
    totalFlights,
    airlinesCount: Object.keys(airlines).length,
    flightTypesCount: Object.keys(flightTypes).length,
  });
  
  return {
    totalFlights,
    cancelledFlights,
    operationalFlights,
    airlines,
    flightTypes,
    lockStats,
    flightsByDate,
    aircraftTypes,
    cancellationRate,
    delayStats,
    ratingDistribution,
  };
};

export const filterFlights = (
  flights: Flight[],
  filters: {
    airline?: string;
    flightType?: string;
    status?: string;
    dateRange?: { startDate: Date; endDate: Date };
  }
): Flight[] => {
  if (!flights || flights.length === 0) return [];
  
  let filteredFlights = [...flights];
  
  // Airline filter
  if (filters.airline && filters.airline.trim() !== '') {
    const searchTerm = filters.airline.toLowerCase();
    filteredFlights = filteredFlights.filter(flight => 
      flight.Airline?.toLowerCase().includes(searchTerm)
    );
  }
  
  // Flight type filter
  if (filters.flightType && filters.flightType.trim() !== '') {
    const searchTerm = filters.flightType.toLowerCase();
    filteredFlights = filteredFlights.filter(flight => 
      flight.Typeofflight?.toLowerCase().includes(searchTerm)
    );
  }
  
  // Status filter
  if (filters.status && filters.status.trim() !== '') {
    const status = filters.status.toLowerCase();
    
    if (status === 'cancelled') {
      filteredFlights = filteredFlights.filter(flight => {
        const flightNo = flight.FlightNo || '';
        const cancelledData = flight["Cancelled data"] || '';
        return flightNo.includes('CANC') || cancelledData.includes('CANC');
      });
    } else if (status === 'delayed') {
      filteredFlights = filteredFlights.filter(flight => {
        const delay = flight.Delay;
        const delayFlight = flight["Delay flight"] || flight["Delay flight "] || 0;
        return delay === 'Delay' || delayFlight > 0;
      });
    } else if (status === 'ontime' || status === 'on time') {
      filteredFlights = filteredFlights.filter(flight => {
        const delay = flight.Delay;
        const delayFlight = flight["Delay flight"] || flight["Delay flight "] || 0;
        return delay === 'On Time' || delayFlight === 0;
      });
    } else if (status === 'beforetime' || status === 'before time') {
      filteredFlights = filteredFlights.filter(flight => 
        flight.Delay === 'Before Time'
      );
    } else if (status === 'operational') {
      filteredFlights = filteredFlights.filter(flight => {
        const flightNo = flight.FlightNo || '';
        const cancelledData = flight["Cancelled data"] || '';
        return !flightNo.includes('CANC') && !cancelledData.includes('CANC');
      });
    }
  }
  
  // Date range filtering
  if (filters.dateRange && filters.dateRange.startDate && filters.dateRange.endDate) {
    filteredFlights = filteredFlights.filter(flight => {
      // Try to extract a date from various fields
      const flightDateStr = flight.STADate?.trim() || flight.STDDate?.trim() || 
                            flight.ATADate?.trim() || flight.ATDDate?.trim() ||
                            flight.ETDdate?.trim();
      
      if (!flightDateStr) return true;
      
      try {
        const [day, month, year] = flightDateStr.split('/').map(Number);
        
        if (!day || !month || !year || isNaN(day) || isNaN(month) || isNaN(year)) {
          return true;
        }
        
        const flightDate = new Date(year, month - 1, day);
        const startDate = new Date(filters.dateRange!.startDate);
        const endDate = new Date(filters.dateRange!.endDate);
        
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);
        flightDate.setHours(12, 0, 0, 0);
        
        return flightDate >= startDate && flightDate <= endDate;
      } catch (error) {
        console.error('Error parsing date:', flightDateStr, error);
        return true;
      }
    });
  }
  
  return filteredFlights;
};

function getEmptyStats(): FlightStats {
  return {
    totalFlights: 0,
    cancelledFlights: 0,
    operationalFlights: 0,
    airlines: {},
    flightTypes: {},
    lockStats: {
      rampLocked: 0,
      paxLocked: 0,
      gsdLocked: 0,
      exportedNAV: 0,
    },
    flightsByDate: {},
    aircraftTypes: {},
    cancellationRate: 0,
    delayStats: {
      onTime: 0,
      delayed: 0,
      beforeTime: 0,
      gha: 0,
      nonGha: 0,
    },
    ratingDistribution: {},
  };
}

export const calculateStatistics = (stats: FlightStats): FlightStats => {
  return stats;
};