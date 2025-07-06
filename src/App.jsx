import React, { useState, useEffect, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, getDoc, setDoc, updateDoc, writeBatch, getDocs } from 'firebase/firestore';
import { format, parseISO, addDays, isFuture, isToday, differenceInDays } from 'date-fns';

// --- Helper Functions & Initial Data ---
const firebaseConfig = {
  apiKey: "AIzaSyBeVV089xto5m_j9u_mWJDU__Qne5ka-ug",
  authDomain: "my-trip-planner-70930.firebaseapp.com",
  projectId: "my-trip-planner-70930",
  storageBucket: "my-trip-planner-70930.appspot.com",
  messagingSenderId: "1019096417355",
  appId: "1:1019096417355:web:e7f0211bbfd08d556679ce"
};

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
        try {
            if (!city || city === 'Travel' || !date) {
                setIsLoading(false);
                return;
            }

            const parsedDate = parseISO(date);
            if (isNaN(parsedDate.getTime())) {
                setIsLoading(false);
                return;
            }

            const daysFromNow = differenceInDays(parsedDate, new Date());

            if (daysFromNow < 0 || daysFromNow > 15) {
                setIsLoading(false);
                return;
            }
            
            setIsLoading(true);
            const coords = {'London': { lat: 51.5074, lon: -0.1278 }, 'Paris': { lat: 48.8566, lon: 2.3522 }};
            const { lat, lon } = coords[city];
            
            const formattedDate = format(parsedDate, 'yyyy-MM-dd');
            
            const apiUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=weathercode,temperature_2m_max,temperature_2m_min&timezone=auto&start_date=${formattedDate}&end_date=${formattedDate}`;
            
            fetch(apiUrl).then(res => {
                if (!res.ok) {
                    throw new Error(`Weather API responded with status: ${res.status}`);
                }
                return res.json();
            }).then(data => {
                if (data.daily && data.daily.temperature_2m_max) {
                    setWeather({maxTemp: Math.round(data.daily.temperature_2m_max[0]), minTemp: Math.round(data.daily.temperature_2m_min[0]), code: data.daily.weathercode[0]});
                }
                setIsLoading(false);
            }).catch(error => {
                console.error("Failed to fetch weather:", error);
                setIsLoading(false);
            });
        } catch (e) {
            console.error("Error in useWeather hook:", e);
            setIsLoading(false);
        }
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

const ShareModal = ({ shareUrl, onClose }) => {
    const [isCopied, setIsCopied] = useState(false);
    const handleCopy = () => {
        const textField = document.createElement('textarea');
        textField.innerText = shareUrl;
        document.body.appendChild(textField);
        textField.select();
        document.execCommand('copy');
        textField.remove();
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
            <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md m-4">
                <h2 className="text-2xl font-bold text-stone-800 font-serif mb-4">Share Your Itinerary</h2>
                <p className="text-stone-600 mb-4">Anyone with this link can view a read-only version of your trip.</p>
                <div className="bg-stone-100 p-3 rounded-md flex items-center justify-between">
                    <input type="text" readOnly value={shareUrl} className="bg-transparent w-full text-stone-700 outline-none" />
                    <button onClick={handleCopy} className={`ml-4 px-4 py-2 text-white font-bold rounded-md ${isCopied ? 'bg-green-600' : 'bg-amber-600 hover:bg-amber-700'}`}>{isCopied ? 'Copied!' : 'Copy'}</button>
                </div>
                <button onClick={onClose} className="mt-6 w-full px-4 py-2 bg-stone-200 text-stone-800 font-bold rounded-md hover:bg-stone-300">Close</button>
            </div>
        </div>
    );
};

const MoveDayModal = ({ day, itinerary, onMove, onClose }) => {
    const [targetDate, setTargetDate] = useState('');
    const handleMove = () => {
        if (targetDate) {
            onMove(day.id, targetDate);
            onClose();
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
            <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md m-4">
                <h2 className="text-2xl font-bold text-stone-800 font-serif mb-4">Move Day's Plan</h2>
                <p className="text-stone-600 mb-2">Move the plan from <span className="font-bold">{format(parseISO(day.date), 'MMM dd')}</span> to:</p>
                <select value={targetDate} onChange={e => setTargetDate(e.target.value)} className="w-full p-2 border border-stone-300 rounded-md">
                    <option value="">Select a date...</option>
                    {itinerary.filter(d => d.id !== day.id).map(d => (
                        <option key={d.id} value={d.id}>{format(parseISO(d.date), 'MMM dd')} - {d.title}</option>
                    ))}
                </select>
                <div className="flex justify-end gap-4 mt-6">
                    <button onClick={onClose} className="px-4 py-2 bg-stone-200 text-stone-800 font-bold rounded-md hover:bg-stone-300">Cancel</button>
                    <button onClick={handleMove} disabled={!targetDate} className="px-4 py-2 bg-amber-600 text-white font-bold rounded-md hover:bg-amber-700 disabled:bg-stone-400">Confirm Move</button>
                </div>
            </div>
        </div>
    );
};

const MiniMap = ({ locations }) => {
    const mapRef = React.useRef(null);
    useEffect(() => {
        if (!mapRef.current || locations.length === 0) return;
        let mapInstance;
        const initMap = () => {
            if (!window.L) { console.error("Leaflet not loaded yet."); return; }
            mapInstance = window.L.map(mapRef.current).setView([locations[0].lat, locations[0].lon], 13);
            window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(mapInstance);
            const bounds = window.L.latLngBounds();
            locations.forEach(loc => {
                const marker = window.L.marker([loc.lat, loc.lon]).addTo(mapInstance);
                marker.bindPopup(`<b>${loc.name}</b>`);
                bounds.extend([loc.lat, loc.lon]);
            });
            if (locations.length > 1) mapInstance.fitBounds(bounds, { padding: [50, 50] });
            else mapInstance.setView([locations[0].lat, locations[0].lon], 13);
        };
        const loadLeaflet = () => {
            if (!document.getElementById('leaflet-css')) {
                const link = document.createElement('link');
                link.id = 'leaflet-css';
                link.rel = 'stylesheet';
                link.href = 'https://unpkg.com/leaflet@1.7.1/dist/leaflet.css';
                document.head.appendChild(link);
            }
            if (window.L) initMap();
            else {
                const script = document.createElement('script');
                script.id = 'leaflet-js';
                script.src = 'https://unpkg.com/leaflet@1.7.1/dist/leaflet.js';
                script.async = true;
                script.onload = initMap;
                script.onerror = () => console.error("Failed to load Leaflet script.");
                document.body.appendChild(script);
            }
        };
        loadLeaflet();
        return () => { if (mapInstance) mapInstance.remove(); };
    }, [locations]);
    if (locations.length === 0) return null;
    return <div ref={mapRef} className="h-64 w-full rounded-lg shadow-md mt-4"></div>;
};

const ItineraryHeader = ({ onShare, isReadOnly }) => (
    <header className="bg-white shadow-md py-6 px-4 sm:px-8 w-full relative">
        <div className="max-w-5xl mx-auto text-center">
            <h1 className="text-4xl sm:text-5xl font-bold text-stone-800 font-serif tracking-tight">London & Paris</h1>
            <p className="text-lg text-stone-600 mt-2 font-sans">An Unforgettable Journey: July 5th - July 25th, 2025</p>
        </div>
        {!isReadOnly && (
            <div className="absolute top-4 right-4">
                <button onClick={onShare} className="p-2 rounded-full text-stone-600 hover:bg-stone-200" title="Share Itinerary">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
                </button>
            </div>
        )}
    </header>
);

const PublishedView = ({ day, onEdit, isReadOnly }) => (
    <div className="bg-stone-50 p-4 sm:p-6 mt-4 border-t-2 border-amber-200 space-y-4">
        <MiniMap locations={day.locations || []} />
        {day.photoUrl && <div className="mb-6"><img src={day.photoUrl} alt="Itinerary visual" className="rounded-lg shadow-lg w-full h-auto object-cover max-h-80" onError={(e) => { e.target.onerror = null; e.target.src='https://placehold.co/600x400/EAE6D7/78716C?text=Image+Not+Found'; }}/></div>}
        <div className="prose prose-lg prose-stone max-w-none font-sans text-stone-800" dangerouslySetInnerHTML={{ __html: parseMarkdown(day.notes) || '<p class="italic text-stone-500">No notes were published for this day.</p>' }}/>
        {!isReadOnly && <div className="text-right pt-4 border-t border-stone-200 mt-6"><button onClick={() => onEdit(day.id)} className="px-6 py-2 bg-stone-600 text-white font-bold rounded-md shadow-sm hover:bg-stone-700">Edit</button></div>}
    </div>
);

const ItineraryEditor = ({ day, onPublish, isSaving, apiKey }) => {
    const [notes, setNotes] = useState(day.notes || '');
    const [photoUrl, setPhotoUrl] = useState(day.photoUrl || '');
    const [locations, setLocations] = useState(day.locations || []);
    const [newLocation, setNewLocation] = useState('');
    const [customPrompt, setCustomPrompt] = useState('');
    const [isGeocoding, setIsGeocoding] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);

    const handleAddLocation = async () => {
        if (!newLocation.trim()) return;
        setIsGeocoding(true);
        try {
            const response = await fetch(`https://api.geoapify.com/v1/geocode/search?text=${encodeURIComponent(newLocation)}&apiKey=${apiKey}`);
            const data = await response.json();
            if (data.features && data.features.length > 0) {
                const { properties } = data.features[0];
                setLocations([...locations, { name: properties.formatted, lat: properties.lat, lon: properties.lon, id: crypto.randomUUID() }]);
                setNewLocation('');
            } else { alert('Location not found. Please try a different name.'); }
        } catch (error) { console.error("Geocoding error:", error); alert('Failed to find location.'); } finally { setIsGeocoding(false); }
    };

    const handleRemoveLocation = (id) => setLocations(locations.filter(loc => loc.id !== id));
    
    const handleGenerateWithGem = async () => {
        setIsGenerating(true);
        const locationNames = locations.length > 0 ? locations.map(l => l.name).join(', ') : 'popular tourist sites';
        
        const prompt = `
*Persona
You are an experienced private tour guide in England and also Paris.

*Goal
Your goal is to generate a perfect itinerary for ${day.city} for one day, based on the provided details. The itinerary is for a family of 3 including an 8 years old boy. Their base is Fowey Pl Belmont, Sutton in July. They will drive a car, so parking cost efficient will be a key consideration. The date is ${format(parseISO(day.date), 'PPPP')}.

*Places to be provided
The itinerary should be centered around these key locations: ${locationNames}.

*Additional User Request
${customPrompt || 'No specific requests.'}

*Task
- Provide detailed itinerary by starting time, with point to point transportation incl. cost and time needed, activities, entrance ticket fare, suggest time spending on each activity.
- Also provide in-route suggestions as well as smart tips. 
- Suggest 3 food options for both lunch and dinner each day preferably local authentic valued options but avoid touristic/overpriced restaurants for the whole family based on Google Reviews and estimated cost. 

*Format
- Keep the itinerary concise and easy to read in bullet points with emojis 
- Stick to 1 line per bullet wherever possible
`;
        
        try {
            const geminiApiKey = ""; // This will be replaced by the environment
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`;
            const payload = { contents: [{ role: "user", parts: [{ text: prompt }] }] };
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result = await response.json();
            if (result.candidates && result.candidates.length > 0) {
                const generatedText = result.candidates[0].content.parts[0].text;
                setNotes(prev => `${prev ? prev + '\n\n' : ''}${generatedText}`);
            } else {
                setNotes(prev => `${prev}\n\nSorry, I couldn't generate a plan right now.`);
            }
        } catch (error) {
            console.error("Gemini API error:", error);
            setNotes(prev => `${prev}\n\nThere was an error contacting the AI planner.`);
        } finally {
            setIsGenerating(false);
        }
    };

    const handlePublish = () => onPublish(day.id, notes, photoUrl, locations);

    return (
        <div className="bg-stone-50 p-4 sm:p-6 mt-4 border-t-2 border-amber-200 space-y-6">
            <div>
                <label className="block text-sm font-medium text-stone-700 font-sans mb-1">Places to Visit</label>
                <div className="flex gap-2">
                    <input type="text" value={newLocation} onChange={e => setNewLocation(e.target.value)} placeholder="e.g., British Museum" className="w-full p-2 border border-stone-300 rounded-md shadow-sm" />
                    <button onClick={handleAddLocation} disabled={isGeocoding || !apiKey} className="px-4 py-2 bg-amber-500 text-white font-bold rounded-md hover:bg-amber-600 disabled:bg-stone-400">{isGeocoding ? '...' : 'Add'}</button>
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                    {locations.map(loc => (<span key={loc.id} className="bg-amber-200 text-amber-800 text-sm font-medium px-3 py-1 rounded-full flex items-center">{loc.name}<button onClick={() => handleRemoveLocation(loc.id)} className="ml-2 text-amber-600 hover:text-amber-800">&times;</button></span>))}
                </div>
            </div>
            
            <div className="space-y-2">
                 <label htmlFor="customPrompt" className="block text-sm font-medium text-stone-700 font-sans">Add specific requests for the planner</label>
                <input type="text" id="customPrompt" value={customPrompt} onChange={e => setCustomPrompt(e.target.value)} placeholder="e.g., focus on outdoor activities" className="w-full p-2 border border-stone-300 rounded-md shadow-sm" />
            </div>

            <div className="space-y-2">
                <div className="flex justify-between items-center">
                    <label htmlFor={`notes-${day.id}`} className="block text-sm font-medium text-stone-700 font-sans">Your Notes & Memories</label>
                    <button onClick={handleGenerateWithGem} disabled={isGenerating} className="px-4 py-2 bg-indigo-600 text-white font-bold rounded-md hover:bg-indigo-700 disabled:bg-stone-400 text-sm">✨ Generate Plan</button>
                </div>
                <textarea id={`notes-${day.id}`} rows="8" className="w-full p-3 border border-stone-300 rounded-md shadow-sm" placeholder="Add locations and requests above, then generate a plan..." value={notes} onChange={(e) => setNotes(e.target.value)}/>
                <p className="text-xs text-stone-500 font-sans">Formatting: `**bold**`, `*italic*`, `-` or `*` for list items. Use an empty line to separate paragraphs.</p>
            </div>

            <div className="space-y-2">
                <label htmlFor={`photo-${day.id}`} className="block text-sm font-medium text-stone-700 font-sans">Add a Photo URL</label>
                <input type="url" id={`photo-${day.id}`} className="w-full p-3 border border-stone-300 rounded-md shadow-sm" placeholder="https://example.com/your-photo.jpg" value={photoUrl} onChange={(e) => setPhotoUrl(e.target.value)}/>
            </div>
            <div className="text-right"><button onClick={handlePublish} disabled={isSaving} className="px-6 py-2 bg-amber-600 text-white font-bold rounded-md shadow-sm hover:bg-amber-700 disabled:bg-stone-400"> {isSaving ? 'Publishing...' : 'Publish'}</button></div>
        </div>
    );
};

const ItineraryDay = ({ day, onSelect, isActive, onPublish, onEdit, isSaving, isReadOnly, onMoveRequest, apiKey }) => {
    const dayDate = parseISO(day.date);
    const { weather, isLoading } = useWeather(day.city, day.date);
    const handleMoveClick = (e) => { e.stopPropagation(); onMoveRequest(day); };
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
                            {day.isPublished && <span className="text-xs font-bold text-white bg-green-600 rounded-full px-2 py-1 hidden sm:inline-block">Published</span>}
                            {!isReadOnly && (<>
                                <button onClick={handleMoveClick} className="p-2 rounded-full text-stone-500 hover:bg-stone-200" title="Move this day's plan"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg></button>
                                <button onClick={() => onSelect(day.id)} className="p-2 rounded-full text-stone-500 hover:bg-stone-200"><svg className={`w-6 h-6 text-amber-600 transform transition-transform duration-300 ${isActive ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg></button>
                            </>)}
                        </div>
                    </div>
                </div>
            </div>
            {isActive && (day.isPublished ? <PublishedView day={day} onEdit={onEdit} isReadOnly={isReadOnly} /> : <ItineraryEditor day={day} onPublish={onPublish} isSaving={isSaving} apiKey={apiKey} />)}
        </div>
    );
};

// --- Main App Component ---

function App() {
    const [itinerary, setItinerary] = useState([]);
    const [activeDayId, setActiveDayId] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState(null);
    const [db, setDb] = useState(null);
    const [auth, setAuth] = useState(null);
    const [userId, setUserId] = useState(null);
    const [shareId, setShareId] = useState(null);
    const [showShareModal, setShowShareModal] = useState(false);
    const [showMoveModal, setShowMoveModal] = useState(false);
    const [dayToMove, setDayToMove] = useState(null);
    const [shareUrl, setShareUrl] = useState('');
    const [apiKey, setApiKey] = useState('31d4f18e5f3043b590e1fbc1fc299746'); // Stored API Key
    const isReadOnly = !!shareId;

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const id = params.get('shareId');
        if (id) setShareId(id);
        
        try {
            const app = initializeApp(firebaseConfig);
            const firestore = getFirestore(app);
            const authInstance = getAuth(app);
            setDb(firestore);
            setAuth(authInstance);
        } catch (e) { console.error("Firebase initialization failed:", e); setError("Could not initialize the application."); setIsLoading(false); }
    }, []);

    useEffect(() => {
        if (!auth || shareId) return;
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            if (user) {
                setUserId(user.uid);
            } else {
                signInAnonymously(auth).catch(err => setError("Could not connect to the database."));
            }
        });
        return () => unsubscribe();
    }, [auth, shareId]);

    useEffect(() => {
        if (!db) return;

        const loadData = async () => {
            setIsLoading(true);
            if (shareId) {
                const docRef = doc(db, "shared_itineraries", shareId);
                try {
                    const docSnap = await getDoc(docRef);
                    if (docSnap.exists()) {
                        const daysData = docSnap.data().days || [];
                        daysData.sort((a, b) => new Date(a.date) - new Date(b.date));
                        setItinerary(daysData);
                        setActiveDayId(daysData[0]?.id || null);
                    } else {
                        setError("This shared itinerary could not be found.");
                    }
                } catch (e) {
                    console.error("Error loading shared itinerary:", e);
                    setError("Could not load the shared itinerary.");
                } finally {
                    setIsLoading(false);
                }
            } else if (userId) {
                const collectionPath = `users/${userId}/tripDays`;
                try {
                    const querySnapshot = await getDocs(collection(db, collectionPath));
                    if (querySnapshot.empty) {
                        const initialDays = generateInitialItinerary();
                        const batch = writeBatch(db);
                        initialDays.forEach(day => {
                            const dayDocRef = doc(db, collectionPath, day.id);
                            batch.set(dayDocRef, day);
                        });
                        await batch.commit();
                        setItinerary(initialDays);
                    } else {
                        const daysData = querySnapshot.docs.map(doc => doc.data());
                        daysData.sort((a, b) => new Date(a.date) - new Date(b.date));
                        setItinerary(daysData);
                    }
                    setActiveDayId(generateInitialItinerary()[0]?.id || null);
                } catch (e) {
                    console.error("Error loading user itinerary:", e);
                    setError("A problem occurred while loading your itinerary.");
                } finally {
                    setIsLoading(false);
                }
            }
        };

        if (shareId || userId) {
            loadData();
        } else if (!shareId) {
            // This prevents trying to load data before authentication is complete.
        } else {
            setIsLoading(false);
        }

    }, [db, userId, shareId]);


    const handleSelectDay = (dayId) => !isReadOnly && setActiveDayId(prevId => (prevId === dayId ? null : dayId));
    
    const handlePublish = useCallback(async (dayId, notes, photoUrl, locations) => {
        if (!db || !userId) return;
        setIsSaving(true);
        const dayDocRef = doc(db, `users/${userId}/tripDays`, dayId);
        const updatedData = { notes, photoUrl, locations, isPublished: true };
        try {
            await updateDoc(dayDocRef, updatedData);
            setItinerary(prev => prev.map(d => d.id === dayId ? {...d, ...updatedData} : d));
        } catch (err) { setError("Could not publish your entry."); } 
        finally { setIsSaving(false); }
    }, [db, userId]);

    const handleEdit = useCallback(async (dayId) => {
        if (!db || !userId) return;
        const dayDocRef = doc(db, `users/${userId}/tripDays`, dayId);
        const updatedData = { isPublished: false };
        try {
            await updateDoc(dayDocRef, updatedData);
            setItinerary(prev => prev.map(d => d.id === dayId ? {...d, ...updatedData} : d));
            setActiveDayId(dayId);
        } catch (err) { setError("Could not switch to edit mode."); }
    }, [db, userId]);

    const handleShare = useCallback(async () => {
        if (!db || !userId) return;
        const metaRef = doc(db, `users/${userId}/meta`, 'share');
        let currentShareId;
        try {
            const metaSnap = await getDoc(metaRef);
            if (metaSnap.exists()) { currentShareId = metaSnap.data().id; } 
            else { currentShareId = crypto.randomUUID(); await setDoc(metaRef, { id: currentShareId }); }
            const publicDocRef = doc(db, `shared_itineraries`, currentShareId);
            const publishedItinerary = itinerary.map(day => day.isPublished ? day : { ...day, notes: '', photoUrl: '', locations: [] });
            await setDoc(publicDocRef, { days: publishedItinerary });
            const url = `${window.location.origin}${window.location.pathname}?shareId=${currentShareId}`;
            setShareUrl(url);
            setShowShareModal(true);
        } catch (err) { console.error("Sharing failed:", err); setError("Could not create a shareable link."); }
    }, [db, userId, itinerary]);
    
    const handleMoveRequest = (day) => setDayToMove(day);

    const handleMoveConfirm = useCallback(async (sourceId, targetId) => {
        if (!db || !userId) return;
        const sourceDay = itinerary.find(d => d.id === sourceId);
        const targetDay = itinerary.find(d => d.id === targetId);
        if (!sourceDay || !targetDay) return;

        const sourceContent = { notes: sourceDay.notes, photoUrl: sourceDay.photoUrl, locations: sourceDay.locations, isPublished: sourceDay.isPublished };
        const targetContent = { notes: targetDay.notes, photoUrl: targetDay.photoUrl, locations: targetDay.locations, isPublished: targetDay.isPublished };

        const batch = writeBatch(db);
        const sourceDocRef = doc(db, `users/${userId}/tripDays`, sourceId);
        const targetDocRef = doc(db, `users/${userId}/tripDays`, targetId);
        batch.update(sourceDocRef, targetContent);
        batch.update(targetDocRef, sourceContent);

        try {
            await batch.commit();
            setItinerary(prev => prev.map(day => {
                if (day.id === sourceId) return { ...day, ...targetContent };
                if (day.id === targetId) return { ...day, ...sourceContent };
                return day;
            }));
        } catch (err) {
            console.error("Failed to move day:", err);
            setError("Could not move the day's plan. Please try again.");
        }
        setDayToMove(null);
    }, [db, userId, itinerary]);

    return (
        <div className="bg-stone-100 min-h-screen font-sans">
            <ItineraryHeader onShare={handleShare} isReadOnly={isReadOnly} />
            <main className="max-w-4xl mx-auto p-4 sm:p-8">
                <div className="space-y-6">
                    {isLoading ? <LoadingSpinner /> : itinerary.map(day => (
                        <ItineraryDay key={day.id} day={day} onSelect={handleSelectDay} isActive={activeDayId === day.id} onPublish={handlePublish} onEdit={handleEdit} isSaving={isSaving && activeDayId === day.id} isReadOnly={isReadOnly} onMoveRequest={handleMoveRequest} apiKey={apiKey}/>
                    ))}
                    {error && <p className="text-red-500 text-center">{error}</p>}
                </div>
            </main>
            <footer className="text-center py-8 text-stone-500 text-sm"><p>Have a wonderful trip!</p></footer>
            {showShareModal && <ShareModal shareUrl={shareUrl} onClose={() => setShowShareModal(false)} />}
            {dayToMove && <MoveDayModal day={dayToMove} itinerary={itinerary} onMove={handleMoveConfirm} onClose={() => setDayToMove(null)} />}
        </div>
    );
}

export default App;

