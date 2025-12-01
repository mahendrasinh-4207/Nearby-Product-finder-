import React, { useState, useRef, useCallback, useMemo } from 'react';
import { AppStep, ProductInfo, Shop, OnlineStore, UserLocation, ResultView, SimilarProduct } from './types';
import * as geminiService from './services/geminiService';
import { Icon } from './components/Icons';

// --- UI Components ---

const FileUploadCard: React.FC<{ onFileSelect: (file: File) => void; disabled: boolean }> = ({ onFileSelect, disabled }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const handleCardClick = () => fileInputRef.current?.click();
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) onFileSelect(file);
  };
  return (
    <div onClick={handleCardClick} className={`relative w-full max-w-md mx-auto bg-white rounded-2xl shadow-lg border-2 border-dashed ${disabled ? 'border-gray-300 bg-gray-100' : 'border-indigo-400 hover:border-indigo-600 cursor-pointer'} transition-all duration-300 p-8 text-center`}>
      <div className="flex flex-col items-center justify-center space-y-4 text-gray-600">
        <Icon name="upload" className="w-16 h-16 text-indigo-500" />
        <h2 className="text-xl font-semibold">Upload Product Image</h2>
        <p className="text-sm text-gray-500">Click or tap to select an image</p>
      </div>
      <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*" disabled={disabled} />
    </div>
  );
};

const ProcessingScreen: React.FC<{ imageUrl: string; message: string }> = ({ imageUrl, message }) => (
    <div className="fixed inset-0 bg-gray-900 bg-opacity-75 flex flex-col items-center justify-center z-50 p-4 backdrop-blur-sm">
        <div className="relative w-64 h-64">
            <img src={imageUrl} alt="Analyzing product" className="w-full h-full object-cover rounded-2xl shadow-2xl animate-pulse-slow" />
            <div className="absolute -top-2 -left-2 w-8 h-8 border-t-4 border-l-4 border-white rounded-tl-xl animate-scanner-tl"></div>
            <div className="absolute -top-2 -right-2 w-8 h-8 border-t-4 border-r-4 border-white rounded-tr-xl animate-scanner-tr"></div>
            <div className="absolute -bottom-2 -left-2 w-8 h-8 border-b-4 border-l-4 border-white rounded-bl-xl animate-scanner-bl"></div>
            <div className="absolute -bottom-2 -right-2 w-8 h-8 border-b-4 border-r-4 border-white rounded-br-xl animate-scanner-br"></div>
        </div>
        <p className="text-white text-lg font-medium mt-8 animate-fade-in-out">{message}</p>
        <style>{`
            @keyframes pulse-slow {
                0%, 100% { transform: scale(1); }
                50% { transform: scale(1.03); }
            }
            @keyframes scanner-corner {
                0%, 100% { transform: translate(0, 0); }
                25% { transform: translate(var(--tw-translate-x), var(--tw-translate-y)); }
                50% { transform: translate(var(--tw-translate-x), 0); }
                75% { transform: translate(0, var(--tw-translate-y)); }
            }
            .animate-scanner-tl { --tw-translate-x: 8px; --tw-translate-y: 8px; animation: scanner-corner 2.5s infinite cubic-bezier(0.4, 0, 0.2, 1); }
            .animate-scanner-tr { --tw-translate-x: -8px; --tw-translate-y: 8px; animation: scanner-corner 2.5s infinite cubic-bezier(0.4, 0, 0.2, 1); animation-delay: 0.2s; }
            .animate-scanner-bl { --tw-translate-x: 8px; --tw-translate-y: -8px; animation: scanner-corner 2.5s infinite cubic-bezier(0.4, 0, 0.2, 1); animation-delay: 0.3s; }
            .animate-scanner-br { --tw-translate-x: -8px; --tw-translate-y: -8px; animation: scanner-corner 2.5s infinite cubic-bezier(0.4, 0, 0.2, 1); animation-delay: 0.5s; }
            .animate-pulse-slow { animation: pulse-slow 2.5s infinite cubic-bezier(0.4, 0, 0.2, 1); }
            @keyframes fade-in-out {
                0%, 100% { opacity: 0.7; }
                50% { opacity: 1; }
            }
            .animate-fade-in-out { animation: fade-in-out 2s infinite ease-in-out; }
        `}</style>
    </div>
);

// --- App Component ---

const App: React.FC = () => {
  const [step, setStep] = useState<AppStep>(AppStep.UPLOAD);
  const [processingMessage, setProcessingMessage] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [productInfo, setProductInfo] = useState<ProductInfo | null>(null);
  const [nearbyShops, setNearbyShops] = useState<Shop[] | null>(null);
  const [onlineStores, setOnlineStores] = useState<OnlineStore[] | null>(null);
  const [similarProducts, setSimilarProducts] = useState<SimilarProduct[] | null>(null);
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [currentView, setCurrentView] = useState<ResultView>(ResultView.DETAILS);

  const fullReset = () => {
    setStep(AppStep.UPLOAD);
    softReset();
    setUserLocation(null);
  };
  
  const softReset = () => {
    setProcessingMessage('');
    setError(null);
    setImageUrl(null);
    setProductInfo(null);
    setNearbyShops(null);
    setOnlineStores(null);
    setSimilarProducts(null);
    setCurrentView(ResultView.DETAILS);
  };

  const handleAnalysis = useCallback(async (file: File) => {
    setStep(AppStep.PROCESSING);
    softReset();
    setImageUrl(URL.createObjectURL(file));

    try {
      setProcessingMessage('Identifying product...');
      const identified = await geminiService.identifyProduct(file);
      if (!identified) throw new Error("Could not identify the product from the image.");
      
      const { name: productName, type: productType } = identified;
      
      let location = userLocation;
      if (!location) {
        setProcessingMessage('Getting your location...');
        location = await new Promise<UserLocation>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(
                (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
                (err) => reject(new Error("Geolocation permission denied or unavailable."))
            );
        });
        setUserLocation(location);
      }

      setProcessingMessage('Finding product details...');
      const [details, shops, stores, rawSimilar] = await Promise.all([
          geminiService.getProductDetails(productName),
          geminiService.findNearbyShops(productName, productType, location),
          geminiService.findOnlineStores(productName),
          geminiService.findSimilarProducts(productName)
      ]);
      
      if (!details) throw new Error("Could not fetch product details.");
      
      setProductInfo({ name: productName, type: productType, ...details });
      setNearbyShops(shops);
      setOnlineStores(stores);
      
      if (rawSimilar) {
        setProcessingMessage('Generating product visuals...');
        const processedSimilar = await Promise.all(
          rawSimilar.map(async (p) => {
            if (p.imageUrl) {
              return { name: p.name, imageUrl: p.imageUrl };
            }
            const generatedImage = await geminiService.generateProductImage(p.name);
            return { name: p.name, imageUrl: generatedImage };
          })
        );
        // Filter out any products where image generation failed
        setSimilarProducts(processedSimilar.filter(p => p.imageUrl) as SimilarProduct[]);
      } else {
        setSimilarProducts(rawSimilar); // which is null
      }

      setStep(AppStep.RESULTS);

    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred.');
      setStep(AppStep.ERROR);
    }
  }, [userLocation]);

  const handleSimilarProductAnalysis = async (product: SimilarProduct) => {
    setStep(AppStep.PROCESSING);
    setProcessingMessage(`Finding "${product.name}"...`);

    try {
        // NOTE: This public CORS proxy is for demonstration purposes.
        // It may be unreliable and requires a one-time activation by visiting its homepage.
        // For a production app, a self-hosted CORS proxy is recommended.
        const proxyUrl = `https://cors-anywhere.herokuapp.com/${product.imageUrl}`;
        const response = await fetch(proxyUrl);
        if (!response.ok) throw new Error(`Failed to fetch image. Status: ${response.status}`);
        const blob = await response.blob();
        const fileName = product.name.replace(/\s/g, '_') + '.jpg';
        const file = new File([blob], fileName, { type: blob.type });

        await handleAnalysis(file);
    } catch (err: any) {
        setError(`Could not analyze similar product. The image may be protected or inaccessible. Details: ${err.message}`);
        setStep(AppStep.ERROR);
    }
  };

  const renderContent = () => {
    switch (step) {
      case AppStep.UPLOAD:
        return <FileUploadCard onFileSelect={handleAnalysis} disabled={false} />;
      case AppStep.PROCESSING:
        return imageUrl ? <ProcessingScreen imageUrl={imageUrl} message={processingMessage} /> : null;
      case AppStep.RESULTS:
        return (
            <ResultsView
                productInfo={productInfo!}
                imageUrl={imageUrl!}
                nearbyShops={nearbyShops}
                onlineStores={onlineStores}
                similarProducts={similarProducts}
                currentView={currentView}
                setCurrentView={setCurrentView}
                onStartOver={fullReset}
                onFindSimilar={handleSimilarProductAnalysis}
            />
        );
      case AppStep.ERROR:
        return (
          <div className="w-full max-w-md mx-auto bg-white p-8 rounded-2xl shadow-lg text-center">
            <h2 className="text-xl font-bold text-red-600">An Error Occurred</h2>
            <p className="text-gray-600 mt-2">{error}</p>
            <button onClick={fullReset} className="mt-6 bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-indigo-700 transition-colors">
              Try Again
            </button>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4 font-sans">
      <div className="w-full max-w-md mx-auto">
        <header className="text-center mb-8">
            <div className="flex justify-center items-center gap-2">
                <Icon name="sparkles" className="w-8 h-8 text-indigo-500" />
                <h1 className="text-4xl font-bold text-gray-800">Product Finder AI</h1>
            </div>
            <p className="text-gray-500 mt-2">Find any product from an image.</p>
        </header>
        <main>
          {renderContent()}
        </main>
      </div>
    </div>
  );
};


// --- Results Components ---

const EmptyState: React.FC<{ icon: string; message: string; description: string }> = ({ icon, message, description }) => (
    <div className="flex flex-col items-center justify-center text-center text-gray-500 min-h-[200px]">
        <Icon name={icon} className="w-12 h-12 text-gray-400 mb-4" />
        <h4 className="font-semibold text-gray-700">{message}</h4>
        <p className="text-sm mt-1">{description}</p>
    </div>
);

interface ResultsViewProps {
    productInfo: ProductInfo;
    imageUrl: string;
    nearbyShops: Shop[] | null;
    onlineStores: OnlineStore[] | null;
    similarProducts: SimilarProduct[] | null;
    currentView: ResultView;
    setCurrentView: (view: ResultView) => void;
    onStartOver: () => void;
    onFindSimilar: (product: SimilarProduct) => void;
}

const ResultsView: React.FC<ResultsViewProps> = (props) => {
    const { productInfo, imageUrl, currentView, setCurrentView, onStartOver } = props;

    const navItems = [
        { view: ResultView.DETAILS, icon: 'info', label: 'Details' },
        { view: ResultView.NEARBY, icon: 'store', label: 'Nearby' },
        { view: ResultView.ONLINE, icon: 'cart', label: 'Online' },
        { view: ResultView.SIMILAR, icon: 'grid', label: 'Similar' },
    ];

    return (
        <div className="w-full max-w-md mx-auto space-y-4">
            {/* Product Header */}
            <div className="bg-white rounded-2xl shadow-lg p-4 flex space-x-4 items-center">
                <img src={imageUrl} alt="Product" className="w-20 h-20 object-cover rounded-lg shadow-md flex-shrink-0" />
                <div className="flex-grow">
                    <h4 className="text-lg font-bold text-gray-900">{productInfo.name}</h4>
                    <p className="text-sm text-gray-500 bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full inline-block mt-1">{productInfo.type}</p>
                </div>
            </div>

            {/* Navigation */}
            <div className="grid grid-cols-4 gap-2 bg-gray-200 p-1 rounded-full">
                {navItems.map(item => (
                    <button key={item.view} onClick={() => setCurrentView(item.view)} className={`flex items-center justify-center space-x-2 rounded-full py-2 text-sm font-semibold transition-colors ${currentView === item.view ? 'bg-white text-indigo-600 shadow' : 'text-gray-600 hover:bg-gray-300'}`}>
                        <Icon name={item.icon} className="w-5 h-5" />
                        <span>{item.label}</span>
                    </button>
                ))}
            </div>

            {/* Content */}
            <div className="bg-white rounded-2xl shadow-lg p-4 min-h-[300px]">
                {currentView === ResultView.DETAILS && <ProductDetailsView {...props} />}
                {currentView === ResultView.NEARBY && <NearbyShopsView {...props} />}
                {currentView === ResultView.ONLINE && <OnlineStoresView {...props} />}
                {currentView === ResultView.SIMILAR && <SimilarProductsView {...props} />}
            </div>

            <button onClick={onStartOver} className="w-full bg-indigo-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-indigo-700 transition-colors">
                Start Over
            </button>
        </div>
    );
};

const ProductDetailsView: React.FC<ResultsViewProps> = ({ productInfo }) => (
    <div>
        <h3 className="font-bold text-xl text-gray-800">Product Details</h3>
        <div className="mt-4 space-y-4">
            <div>
                <h5 className="font-semibold text-gray-700">Approximate Price</h5>
                <p className="mt-1 text-2xl font-light text-indigo-600">{productInfo.approximatePrice}</p>
            </div>
            <div>
                <h5 className="font-semibold text-gray-700">Key Features</h5>
                <ul className="list-disc list-inside text-gray-600 text-sm mt-1 space-y-1">
                    {productInfo.keyFeatures.map((spec, i) => <li key={i}>{spec}</li>)}
                </ul>
            </div>
        </div>
    </div>
);

type ShopSortKey = 'chances' | 'distance' | 'rating' | 'relevance';
const shopSortOptions: { key: ShopSortKey, label: string }[] = [
    { key: 'chances', label: 'Chances' },
    { key: 'distance', label: 'Distance' },
    { key: 'rating', label: 'Rating' },
    { key: 'relevance', label: 'Relevance' },
];

const SortFilters: React.FC<{ options: { key: string, label: string }[], active: string, setActive: (key: any) => void }> = ({ options, active, setActive }) => (
    <div className="flex items-center space-x-2 bg-gray-100 p-1 rounded-full text-sm">
        {options.map(opt => (
            <button key={opt.key} onClick={() => setActive(opt.key)} className={`px-3 py-1 rounded-full transition-colors font-medium ${active === opt.key ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-600 hover:bg-gray-200'}`}>
                {opt.label}
            </button>
        ))}
    </div>
);

const NearbyShopsView: React.FC<ResultsViewProps> = ({ nearbyShops }) => {
    const [sortKey, setSortKey] = useState<ShopSortKey>('chances');

    const sortedShops = useMemo(() => {
        if (!nearbyShops) return [];
        const shopsCopy = [...nearbyShops];
        switch (sortKey) {
            case 'chances':
                return shopsCopy.sort((a, b) => b.availabilityScore - a.availabilityScore);
            case 'rating':
                return shopsCopy.sort((a, b) => b.rating - a.rating);
            case 'distance':
                return shopsCopy.sort((a, b) => parseFloat(a.distance) - parseFloat(b.distance));
            case 'relevance':
            default:
                return nearbyShops;
        }
    }, [nearbyShops, sortKey]);
    
    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="font-bold text-xl text-gray-800">Nearby Shops</h3>
                {nearbyShops && nearbyShops.length > 0 && (
                    <SortFilters options={shopSortOptions} active={sortKey} setActive={setSortKey} />
                )}
            </div>
            {sortedShops.length > 0 ? (
                <ul className="space-y-3">
                    {sortedShops.map((shop, i) => (
                        <a key={i} href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(shop.name + ', ' + shop.address)}`} target="_blank" rel="noopener noreferrer" className="block p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                            <div className="flex items-center justify-between">
                                <div className="flex-grow pr-4">
                                    <p className="font-semibold text-gray-800">{shop.name}</p>
                                    <p className="text-xs text-gray-500 flex items-center gap-1 mt-1"><Icon name="location" className="w-3 h-3"/> {shop.address} ({shop.distance})</p>
                                </div>
                                <div className="text-right flex-shrink-0">
                                    <p className="text-sm font-medium text-indigo-600">{(shop.availabilityScore * 100).toFixed(0)}% chance</p>
                                    <p className="text-xs text-yellow-600 mt-1">⭐ {shop.rating.toFixed(1)}</p>
                                </div>
                            </div>
                        </a>
                    ))}
                </ul>
            ) : (
                <EmptyState icon="store" message="No Shops Found" description="We couldn't find any nearby stores carrying this product." />
            )}
        </div>
    );
};


type OnlineStoreSortKey = 'match' | 'price_asc' | 'price_desc';
const onlineSortOptions: { key: OnlineStoreSortKey, label: string }[] = [
    { key: 'match', label: 'Best Match' },
    { key: 'price_asc', label: 'Price Low-High' },
    { key: 'price_desc', label: 'Price High-Low' },
];

const parsePrice = (priceStr: string): number => {
    if (!priceStr) return Infinity; 
    const numericStr = priceStr.replace(/[^0-9.]/g, '');
    const price = parseFloat(numericStr);
    return isNaN(price) ? Infinity : price;
};

const OnlineStoresView: React.FC<ResultsViewProps> = ({ onlineStores }) => {
    const [sortKey, setSortKey] = useState<OnlineStoreSortKey>('match');

    const sortedStores = useMemo(() => {
        if (!onlineStores) return [];
        const storesCopy = [...onlineStores];
        switch (sortKey) {
            case 'price_asc':
                return storesCopy.sort((a, b) => parsePrice(a.price) - parsePrice(b.price));
            case 'price_desc':
                return storesCopy.sort((a, b) => parsePrice(b.price) - parsePrice(a.price));
            case 'match':
            default:
                return onlineStores;
        }
    }, [onlineStores, sortKey]);

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="font-bold text-xl text-gray-800">Online Availability</h3>
                {onlineStores && onlineStores.length > 0 && (
                    <SortFilters options={onlineSortOptions} active={sortKey} setActive={setSortKey} />
                )}
            </div>
            {sortedStores.length > 0 ? (
                <ul className="space-y-3">
                    {sortedStores.map((store, i) => (
                        <li key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                            <div>
                                <p className="font-semibold text-gray-800">{store.platform}</p>
                                <p className={`text-sm font-bold ${store.stockStatus === 'In Stock' ? 'text-green-600' : 'text-red-500'}`}>{store.stockStatus}</p>
                            </div>
                            <div className="text-right">
                                <p className="font-semibold text-lg text-gray-900">{store.price}</p>
                                <a href={store.url} target="_blank" rel="noopener noreferrer" className="text-sm text-indigo-600 hover:underline">
                                    Go to store
                                </a>
                            </div>
                        </li>
                    ))}
                </ul>
            ) : (
                <EmptyState icon="cart" message="Not Available Online" description="We couldn't find this product on major online platforms." />
            )}
        </div>
    );
};

const SimilarProductsView: React.FC<ResultsViewProps> = ({ similarProducts, onFindSimilar }) => (
    <div>
        <h3 className="font-bold text-xl text-gray-800">Similar Products</h3>
        {similarProducts && similarProducts.length > 0 ? (
            <div className="grid grid-cols-2 gap-4 mt-4">
                {similarProducts.map((product, i) => (
                    <div key={i} className="bg-gray-50 rounded-lg overflow-hidden group">
                        <div className="relative aspect-square">
                            <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover"/>
                            <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-40 transition-all duration-300 flex items-center justify-center">
                                <button onClick={() => onFindSimilar(product)} className="bg-white text-indigo-600 font-bold py-2 px-3 rounded-lg text-xs opacity-0 group-hover:opacity-100 transition-opacity transform scale-90 group-hover:scale-100">
                                    Find This
                                </button>
                            </div>
                        </div>
                        <p className="text-xs font-semibold text-gray-700 p-2 truncate">{product.name}</p>
                    </div>
                ))}
            </div>
        ) : (
            <EmptyState 
                icon="grid"
                message="No Similar Products"
                description="We couldn't find any visually similar products."
            />
        )}
    </div>
);

export default App;