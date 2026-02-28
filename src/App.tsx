import { WalletConnectProvider } from '@btc-vision/walletconnect';
import { DannyStatus } from './components/DannyStatus';
import './App.css';

function App() {
    return (
        <WalletConnectProvider theme="dark">
            <DannyStatus />
        </WalletConnectProvider>
    );
}

export default App;
