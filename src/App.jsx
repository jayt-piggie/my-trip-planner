import React, { useState, useEffect } from 'react';
import { format, parseISO, addDays, isFuture, isToday } from 'date-fns';

// --- Helper Functions & Initial Data ---

const parseMarkdown = (text) => {
    if (window.marked) {
        return window.marked.parse(text || '', { gfm: true, breaks: true });
    }
    return text.replace(/\n/g, '<br />');
};

const getWeatherIcon = (code) => {
    const icons = {0: '☀️', 1: '🌤️', 2: '⛅️', 3: '☁️', 45: '🌫️', 48: '🌫️', 51: '🌦️', 53: '🌦️', 55: '🌦️', 61: '🌧️', 63: '🌧️', 65: '🌧️', 71: '🌨️', 73: '🌨️', 75: '🌨️', 80: '🌧️', 81: '🌧️', 82: '⛈️', 95: '⛈️'};
    return icons[code] || '🌡️';
};

const getClothingIcons = (maxTemp, code) => {
    const isRainy = [51, 53, 55, 61, 63, 65, 80, 81, 82, 95].includes(code);
    let suggestions = [];
    if (maxTemp >= 23) suggestions.push('👕', '🕶️');
    else if (maxTemp > 16) suggestions.push('👚');
    else if (maxTemp > 10) suggestions.push('🧥');
    else suggestions.push('🧥', '🧣');
    if (isRainy) suggestions.push('☂️');
    return suggestions.join(' ');
};

const generateInitialItinerary = () => {
    const startDate = parseISO('2025-07-05');
    const endDate = parseISO('2025-07-25');
    const parisStartDate = parseISO('2025-07-15');
    const parisEndDate = parseISO('2025-07-18');
    const travelToParisDate = parseISO('2025-07-14');
    let days = [];
    let currentDate = startDate;
    while (currentDate <= endDate) {
        const dateStr = format(currentDate, 'yyyy-MM-dd');
        let dayData = {id: dateStr, date: dateStr, dayOfWeek: format(currentDate, 'EEEE'), title: 'A Day in London', city: 'London', icon: '🇬🇧', notes: '', photoUrl: '', isPublished: false, locations: []};
        if (currentDate >= parisStartDate && currentDate <= parisEndDate) {
            dayData.city = 'Paris';
            dayData.title = 'A Day in Paris';
            dayData.icon = '🇫🇷';
        } else if (format(currentDate, 'yyyy-MM-dd') === format(travelToParisDate, 'yyyy-MM-dd')) {
            dayData.title = 'Travel Day: London to Paris';
            dayData.city = 'Travel';
            dayData.icon = '🚄';
            dayData.notes = 'Taking the Eurostar from St. Pancras International to Gare du Nord.';
        } else if (format(currentDate, 'yyyy-MM-dd') === '2025-07-19') {
            dayData.title = 'Travel Day: Paris to London';
            dayData.city = 'Travel';
            dayData.icon = '🚄';
            dayData.notes = 'Taking the Eurostar from Gare du Nord back to St. Pancras International.';
        }
        days.push(dayData);
        currentDate = addDays(currentDate, 1);
    }
    return days;
};

// --- UI Components ---

const LoadingSpinner = () => (
    <div className="flex justify-center items-center h-screen bg-stone-50">
        <div className="animate-spin rounded-full h-24 w-24 border-t-4 border-b-4 border-amber-600"></div>
        <p className="text-xl text-stone-700 ml-4 font-serif">Loading Your Itinerary...</p>
    </div>
);

const useWeather = (city, date) => {
    const [weather, setWeather] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    useEffect(() => {
        if (!city || city === 'Travel' || !(isToday(parseISO(date)) || isFuture(parseISO(date)))) {
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        const coords = {'London': { lat: 51.5074, lon: -0.1278 }, 'Paris': { lat: 48.8566, lon: 2.3522 }};
        const { lat, lon } = coords[city];
        const apiUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=weathercode,temperature_2m_max,temperature_2m_min&timezone=auto&start_date=${date}&end_date=${date}`;
        fetch(apiUrl).then(res => res.json()).then(data => {
            if (data.daily && data.daily.temperature_2m_max) {
                setWeather({maxTemp: Math.round(data.daily.temperature_2m_max[0]), minTemp: Math.round(data.daily.temperature_2m_min[0]), code: data.daily.weathercode[0]});
            }
            setIsLoading(false);
        }).catch(error => {
            console.error("Failed to fetch weather:", error);
            setIsLoading(false);
        });
    }, [city, date]);
    return { weather, isLoading };
};

const WeatherForecast = ({ weather, isLoading }) => {
    if (isLoading) return <div className="h-8 w-20 bg-stone-200 rounded-full animate-pulse mt-2"></div>;
    if (!weather) return null;
    return (
        <div className="flex items-center font-semibold bg-amber-100 text-amber-800 rounded-full px-2 py-1 text-xs mt-2" title={`Forecast: ${weather.minTemp}° / ${weather.maxTemp}°C`}>
            <span className="text-md mr-1">{getWeatherIcon(weather.code)}</span>
            {weather.maxTemp}°C
        </div>
    );
};

const ClothingSuggestion = ({ weather, isLoading }) => {
    if (isLoading || !weather) return null;
    return <div className="text-lg mt-1" title="Clothing Suggestion">{getClothingIcons(weather.maxTemp, weather.code)}</div>;
};

const ItineraryHeader = () => (
    <header className="bg-white shadow-md py-6 px-4 sm:px-8 w-full relative">
        <div className="max-w-5xl mx-auto text-center">
            <h1 className="text-4xl sm:text-5xl font-bold text-stone-800 font-serif tracking-tight">London & Paris</h1>
            <p className="text-lg text-stone-600 mt-2 font-sans">An Unforgettable Journey: July 5th - July 25th, 2025</p>
        </div>
    </header>
);

const PublishedView = ({ day }) => (
    <div className="bg-stone-50 p-4 sm:p-6 mt-4 border-t-2 border-amber-200 space-y-4">
        <div className="prose prose-lg prose-stone max-w-none font-sans text-stone-800" dangerouslySetInnerHTML={{ __html: parseMarkdown(day.notes) || '<p class="italic text-stone-500">No notes were published for this day.</p>' }}/>
    </div>
);

const ItineraryDay = ({ day, onSelect, isActive }) => {
    const dayDate = parseISO(day.date);
    const { weather, isLoading } = useWeather(day.city, day.date);
    return (
        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
            <div className="p-4 sm:p-6">
                <div className="flex items-start justify-between gap-4">
                    <div className="flex flex-col items-center w-20 flex-shrink-0">
                        <div className="flex flex-col items-center justify-center bg-stone-100 rounded-lg p-3 w-20 h-20 text-center">
                            <span className="text-3xl font-bold text-amber-700 font-serif">{format(dayDate, 'dd')}</span>
                            <span className="text-sm font-semibold text-stone-600 uppercase tracking-wider">{format(dayDate, 'MMM')}</span>
                        </div>
                        <WeatherForecast weather={weather} isLoading={isLoading} />
                    </div>
                    <div className="flex-grow flex items-start justify-between">
                        <div onClick={() => onSelect(day.id)} className="cursor-pointer flex-grow">
                            <p className="text-sm font-semibold text-stone-500 font-sans">{day.dayOfWeek}</p>
                            <h2 className="text-xl sm:text-2xl font-bold text-stone-800 font-serif">{day.title}</h2>
                            <div className="mt-1">
                                <p className="text-md text-stone-600 font-sans flex items-center"><span className="text-xl mr-2">{day.icon}</span> {day.city}</p>
                                <ClothingSuggestion weather={weather} isLoading={isLoading} />
                            </div>
                        </div>
                        <div className="flex flex-col items-center flex-shrink-0 ml-2 space-y-2">
                            <button onClick={() => onSelect(day.id)} className="p-2 rounded-full text-stone-500 hover:bg-stone-200"><svg className={`w-6 h-6 text-amber-600 transform transition-transform duration-300 ${isActive ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg></button>
                        </div>
                    </div>
                </div>
            </div>
            {isActive && <PublishedView day={day} />}
        </div>
    );
};

// --- Main App Component ---

function App() {
    const [itinerary, setItinerary] = useState([]);
    const [activeDayId, setActiveDayId] = useState(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const initialDays = generateInitialItinerary();
        setItinerary(initialDays);
        setActiveDayId(initialDays[0]?.id || null);
        setIsLoading(false);
    }, []);

    const handleSelectDay = (dayId) => {
        setActiveDayId(prevId => (prevId === dayId ? null : dayId));
    };

    if (isLoading) return <LoadingSpinner />;

    return (
        <div className="bg-stone-100 min-h-screen font-sans">
            <ItineraryHeader />
            <main className="max-w-4xl mx-auto p-4 sm:p-8">
                <div className="space-y-6">
                    {itinerary.map(day => (
                        <ItineraryDay key={day.id} day={day} onSelect={handleSelectDay} isActive={activeDayId === day.id} />
                    ))}
                </div>
            </main>
            <footer className="text-center py-8 text-stone-500 text-sm"><p>Have a wonderful trip!</p></footer>
        </div>
    );
}

export default App;
