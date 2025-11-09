import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface FirebaseUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Get Firebase ID token from request
    const { firebaseIdToken } = await req.json();

    if (!firebaseIdToken) {
      return new Response(
        JSON.stringify({ error: 'Firebase ID token is required' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Verify Firebase token by calling Firebase Auth REST API
    const firebaseProjectId = Deno.env.get('FIREBASE_PROJECT_ID') || 'piere-92841';
    const verifyUrl = `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${Deno.env.get('FIREBASE_API_KEY')}`;

    const verifyResponse = await fetch(verifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: firebaseIdToken })
    });

    if (!verifyResponse.ok) {
      console.error('Firebase token verification failed:', await verifyResponse.text());
      return new Response(
        JSON.stringify({ error: 'Invalid Firebase token' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const verifyData = await verifyResponse.json();
    const firebaseUser: FirebaseUser = {
      uid: verifyData.users[0].localId,
      email: verifyData.users[0].email || null,
      displayName: verifyData.users[0].displayName || null,
      photoURL: verifyData.users[0].photoUrl || null
    };

    console.log('✅ Firebase user verified:', firebaseUser.email);

    // Create Supabase client with service role (admin privileges)
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // Check if user mapping already exists
    const { data: existingMapping, error: mappingError } = await supabase
      .from('user_auth_mapping')
      .select('*')
      .eq('firebase_uid', firebaseUser.uid)
      .maybeSingle();

    if (mappingError && mappingError.code !== 'PGRST116') {
      console.error('Error checking user mapping:', mappingError);
      throw mappingError;
    }

    let supabaseUserId: string;

    if (existingMapping) {
      // User exists - use existing Supabase user ID
      supabaseUserId = existingMapping.supabase_user_id;
      console.log('🔄 Found existing user mapping:', supabaseUserId);

      // Update mapping with latest Firebase profile info
      await supabase
        .from('user_auth_mapping')
        .update({
          email: firebaseUser.email,
          display_name: firebaseUser.displayName,
          photo_url: firebaseUser.photoURL,
          updated_at: new Date().toISOString()
        })
        .eq('firebase_uid', firebaseUser.uid);

    } else {
      // New user - create anonymous Supabase user
      console.log('🆕 Creating new user for Firebase UID:', firebaseUser.uid);

      const { data: { user: newUser }, error: signUpError } = await supabase.auth.admin.createUser({
        email: firebaseUser.email || `${firebaseUser.uid}@firebase.placeholder`,
        email_confirm: true,
        user_metadata: {
          firebase_uid: firebaseUser.uid,
          display_name: firebaseUser.displayName,
          photo_url: firebaseUser.photoURL
        }
      });

      if (signUpError || !newUser) {
        console.error('Error creating Supabase user:', signUpError);
        throw signUpError || new Error('Failed to create user');
      }

      supabaseUserId = newUser.id;

      // Create user mapping
      const { error: insertError } = await supabase
        .from('user_auth_mapping')
        .insert({
          id: crypto.randomUUID(),
          firebase_uid: firebaseUser.uid,
          supabase_user_id: supabaseUserId,
          email: firebaseUser.email,
          display_name: firebaseUser.displayName,
          photo_url: firebaseUser.photoURL,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });

      if (insertError) {
        console.error('Error creating user mapping:', insertError);
        throw insertError;
      }

      console.log('✅ Created new user mapping:', supabaseUserId);
    }

    // Generate Supabase session using generateLink + verifyOtp pattern
    const { data: sessionData, error: sessionError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: firebaseUser.email || `${firebaseUser.uid}@firebase.placeholder`,
    });

    if (sessionError || !sessionData) {
      console.error('Error generating link:', sessionError);
      throw sessionError || new Error('Failed to generate link');
    }

    // Verify the OTP to create a valid session
    const { data: otpData, error: otpError } = await supabase.auth.verifyOtp({
      token_hash: sessionData.properties.hashed_token,
      type: 'magiclink',
    });

    if (otpError || !otpData?.session) {
      console.error('Error verifying OTP:', otpError);
      throw otpError || new Error('Failed to create session');
    }

    console.log('✅ Session created successfully for user:', supabaseUserId);

    return new Response(
      JSON.stringify({
        success: true,
        session: {
          access_token: otpData.session.access_token,
          refresh_token: otpData.session.refresh_token,
          expires_in: otpData.session.expires_in,
          expires_at: otpData.session.expires_at,
          token_type: 'bearer',
          user: {
            id: supabaseUserId,
            email: firebaseUser.email,
            user_metadata: {
              firebase_uid: firebaseUser.uid,
              display_name: firebaseUser.displayName,
              photo_url: firebaseUser.photoURL
            }
          }
        },
        isNewUser: !existingMapping
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Auth link error:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Internal server error',
        details: error instanceof Error ? error.stack : undefined
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
