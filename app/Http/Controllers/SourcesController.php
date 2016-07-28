<?php namespace App\Http\Controllers;

use App\Source;
use App\Http\Requests;
use App\Http\Controllers\Controller;

use Illuminate\Http\Request;

use Cache;

class SourcesController extends Controller {

	/**
	 * Display a listing of the resource.
	 *
	 * @return Response
	 */
	public function index()
	{
		$sources = Source::all();
		return view( 'sources.index', compact('sources') );
	}

	/**
	 * Show the form for creating a new resource.
	 *
	 * @return Response
	 */
	public function create()
	{
		return view( 'sources.create' );
	}

	/**
	 * Store a newly created resource in storage.
	 *
	 * @return Response
	 */
	public function store(Request $request)
	{
		Source::create($request->all());

		Cache::flush();

		return redirect()->route( 'sources.index' )->with( 'message', 'Source created.')->with( 'message-class', 'success' );
	}

	/**
	 * Display the specified resource.
	 *
	 * @param  int  $id
	 * @return Response
	 */
	public function show(Source $source)
	{
		return view( 'sources.show', compact( 'source' ) );
	}

	/**
	 * Show the form for editing the specified resource.
	 *
	 * @param  int  $id
	 * @return Response
	 */
	public function edit(Source $source)
	{
		return view( 'sources.edit', compact( 'source' ) );
	}

	/**
	 * Update the specified resource in storage.
	 *
	 * @param  int  $id
	 * @return Response
	 */
	public function update(Source $source, Request $request)
	{
		$input = array_except( $request->all(), [ '_method', '_token' ] );
		$source->update( $input );

		Cache::flush();
		
		return redirect()->route( 'sources.show', $source->id)->with( 'message', 'Source updated.')->with( 'message-class', 'success' );
	}

	/**
	 * Remove the specified resource from storage.
	 *
	 * @param  int  $id
	 * @return Response
	 */
	public function destroy(Source $source, Request $request) {	
		//check depedencies first
		if( $source->datasets()->count() > 0 ) {
			return redirect()->route('sources.index')->with('message', 'Some datasets are linked to this source, so you cannot delete it.')->with( 'message-class', 'error' );;
		}
		if( $source->variables()->count() > 0 ) {
			return redirect()->route('sources.index')->with('message', 'Some variables are linked to this source, so you cannot delete it.')->with( 'message-class', 'error' );;
		}
		if( $source->values()->count() > 0 ) {
			return redirect()->route('sources.index')->with('message', 'Some values are linked to this source, so you cannot delete it.')->with( 'message-class', 'error' );;
		}
		
		//no dependencies, delete
		$source->delete();
		
		Cache::flush();
		
		return redirect()->route('sources.index')->with('message', 'Source deleted.');
	}

}
