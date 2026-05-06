package com.basitshahid.drop;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.JSObject;

import java.util.ArrayList;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        handleIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handleIntent(intent);
    }

    private void handleIntent(Intent intent) {
        String action = intent.getAction();
        String type = intent.getType();

        if ((Intent.ACTION_SEND.equals(action) || Intent.ACTION_SEND_MULTIPLE.equals(action)) && type != null) {
            ArrayList<Uri> uris = new ArrayList<>();
            if (Intent.ACTION_SEND.equals(action)) {
                Uri uri = (Uri) intent.getParcelableExtra(Intent.EXTRA_STREAM);
                if (uri != null) uris.add(uri);
            } else {
                ArrayList<Uri> intentUris = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
                if (intentUris != null) uris.addAll(intentUris);
            }

            if (!uris.isEmpty()) {
                JSObject ret = new JSObject();
                ArrayList<String> uriStrings = new ArrayList<>();
                for (Uri u : uris) uriStrings.add(u.toString());
                ret.put("uris", uriStrings);
                // Notify the JS side
                getBridge().triggerJSEvent("shareIntent", "window", ret);
            }
        }
    }
}
